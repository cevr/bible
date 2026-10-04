// A compare pane over decoded frames: a `Playable` (`media.ts`) the review's
// synced player drives as it drives a `<video>`, but whose time is a clock
// it shares with the other pane (`media-clock.ts`), so the two never drift.
// Its frames come from a `FrameSource` (live mediabunny's `VideoSampleSink`
// over the render, `webcodecs-browser.ts`; a fake in a test), each drawn
// once the clock passes it and let go (`close`) once another takes its
// place.
//
// A seek opens the frames at its time and is done once the frame holding it
// is drawn, or once a later seek takes its place (its frames are let go
// undrawn). While one seek still decodes, the next shows the key frame at
// its time at once, a scrub's preview, then its exact frame: the masters'
// key frames are 2 s apart. Hidden (`release`), it lets its decoder go and
// opens again at the clock's time when it plays. Its sound (`AudioOut`) is
// heard only unmuted, playing, at 1×: a buffer played at another rate
// changes pitch, as the narration's rule has it.

import { Effect, Option } from 'effect';
import type { MediaClock } from './media-clock.ts';
import type { MediaEvent, Playable } from './media.ts';

/** A decoded frame: where it starts and how long it shows, in seconds. */
export interface Frame {
  readonly timestamp: number;
  readonly duration: number;
  /** Paint it on the pane's canvas. */
  readonly draw: () => void;
  /** Let its memory go: once drawn over, or never drawn. */
  readonly close: () => void;
}

/** The frames from one time on, decoded a little ahead. */
interface FrameStream {
  /** The next frame; none once they run out. */
  readonly next: Effect.Effect<Option.Option<Frame>>;
  /** Let the decoder go. */
  readonly close: Effect.Effect<void>;
}

/** Where a pane's frames come from. */
export interface FrameSource {
  /** How long the file is, in seconds. */
  readonly duration: Effect.Effect<number>;
  /** The frames from the one showing at `t` on. */
  readonly frames: (t: number) => FrameStream;
  /** The key frame at or before `t`: one decode, a scrub's preview. */
  readonly keyFrame: (t: number) => Effect.Effect<Option.Option<Frame>>;
}

/** A pane's sound: played from a time at a rate, or stopped. */
export interface AudioOut {
  readonly start: (t: number, rate: number) => void;
  readonly stop: () => void;
}

/** A pane: a `Playable`, and its decoder let go while it is hidden or gone. */
export interface Pane extends Playable {
  /** Hidden: its decoder and its frames are let go until it plays again. */
  readonly release: () => void;
}

interface PaneOptions {
  readonly source: FrameSource;
  /** The clock every pane of the compare reads. */
  readonly clock: MediaClock;
  /** Run `step` on each animation frame until it answers false; the answer stops it. */
  readonly loop: (step: () => boolean) => () => void;
  readonly audio: Option.Option<AudioOut>;
}

/** Half a frame at 30 fps: a frame whose start is this close to the clock is due. */
const DUE_S = 1 / 60;
/** How far past its frame the clock may run with no next one before the pane says it stalled. */
const STALL_S = 0.1;

/** Run `effect` without waiting for it. */
const run = (effect: Effect.Effect<void>) => {
  Effect.runFork(effect);
};

/** A pane over `source`, on `clock`. */
export const paneOver = ({ source, clock, loop, audio }: PaneOptions): Pane => {
  const events = new EventTarget();
  const say = (event: MediaEvent) => events.dispatchEvent(new Event(event));

  let frames = Option.none<FrameStream>();
  let shown = Option.none<Frame>();
  let next = Option.none<Frame>();
  /** The frames ran out: the last one is shown or due. */
  let exhausted = false;
  let pulling = false;
  /** Each seek's number: a later one takes an earlier one's place. */
  let asked = 0;
  /** The seek whose frame is shown. */
  let settled = 0;
  /** Seeks waiting to be done: done once their frame shows, or a later seek starts. */
  const waiting: Array<() => void> = [];
  let duration = Number.NaN;
  let playing = false;
  let ended = false;
  let stalled = false;
  let muted = true;
  let speed = 1;
  let heard = false;
  let stopLoop = Option.none<() => void>();

  const time = () => {
    const t = clock.time();
    if (Number.isFinite(duration)) return Math.min(t, duration);
    return t;
  };

  const show = (frame: Frame) => {
    Option.map(shown, (old) => old.close());
    frame.draw();
    shown = Option.some(frame);
  };

  /** Let the frames go: the decoder closed, the frame waiting closed. */
  const drop = () => {
    Option.map(frames, (stream) => run(stream.close));
    frames = Option.none();
    Option.map(next, (f) => f.close());
    next = Option.none();
    pulling = false;
    exhausted = false;
  };

  /** Fetch the frame after the one shown, once, for seek `seek`. */
  const pull = (seek: number) => {
    if (pulling || exhausted || Option.isSome(next)) return;
    Option.map(frames, (stream) => {
      pulling = true;
      run(
        Effect.map(stream.next, (got) => {
          if (seek !== asked) {
            Option.map(got, (f) => f.close());
            return;
          }
          pulling = false;
          Option.match(got, {
            onNone: () => {
              exhausted = true;
            },
            onSome: (f) => {
              next = Option.some(f);
              if (!stalled) return;
              stalled = false;
              say('canplay');
            },
          });
        }),
      );
    });
  };

  /** Seek `seek` done: its frame shows (or its frames ran out); every seek waiting is done. */
  const done = (seek: number) => {
    settled = seek;
    for (const resume of waiting.splice(0)) resume();
    pull(seek);
  };

  /** Open the frames at `t` for seek `seek`, and show the first. */
  const open = (t: number, seek: number) => {
    drop();
    const stream = source.frames(t);
    frames = Option.some(stream);
    run(
      Effect.map(stream.next, (first) => {
        if (seek !== asked) {
          Option.map(first, (f) => f.close());
          return;
        }
        Option.match(first, {
          onNone: () => {
            exhausted = true;
          },
          onSome: show,
        });
        done(seek);
      }),
    );
  };

  /** While a seek still decodes, show the key frame at `t` for seek `seek` at once. */
  const preview = (t: number, seek: number) =>
    run(
      Effect.map(source.keyFrame(t), (key) =>
        Option.map(key, (frame) => {
          if (seek === asked && settled !== seek) show(frame);
          else frame.close();
        }),
      ),
    );

  /** The sound heard only unmuted, playing, at 1×; heard again from here after a seek. */
  const hear = (again = false) =>
    Option.map(audio, (out) => {
      const want = playing && !muted && speed === 1;
      if (heard && (!want || again)) {
        out.stop();
        heard = false;
      }
      if (want && !heard) {
        out.start(time(), speed);
        heard = true;
      }
    });

  /** Each frame while playing: draw the frame the clock has reached; say when it ends or stalls. */
  const step = (): boolean => {
    if (!playing) return false;
    const t = time();
    Option.map(
      Option.filter(next, (f) => f.timestamp <= t + DUE_S),
      (due) => {
        next = Option.none();
        show(due);
        pull(asked);
      },
    );
    const atEnd = Number.isFinite(duration) && t >= duration - DUE_S;
    if (exhausted && Option.isNone(next) && atEnd && !ended) {
      ended = true;
      say('ended');
    }
    const behind = Option.exists(shown, (f) => t > f.timestamp + f.duration + STALL_S);
    if (pulling && Option.isNone(next) && behind && !stalled) {
      stalled = true;
      say('stalled');
    }
    return true;
  };

  const startLoop = () => {
    if (Option.isSome(stopLoop)) return;
    stopLoop = Option.some(
      loop(() => {
        const more = step();
        if (!more) stopLoop = Option.none();
        return more;
      }),
    );
  };
  const haltLoop = () => {
    Option.map(stopLoop, (stop) => stop());
    stopLoop = Option.none();
  };

  run(
    Effect.map(source.duration, (seconds) => {
      duration = seconds;
      say('measured');
    }),
  );

  return {
    time,
    duration: () => duration,
    ready: () => settled === asked && (Option.isSome(next) || exhausted),
    playing: () => playing,
    seeking: () => settled !== asked,
    ended: () => ended,
    seek: (t) =>
      Effect.callback<void>((resume) => {
        const inFlight = settled !== asked;
        // A later seek takes the place of any still waiting.
        for (const earlier of waiting.splice(0)) earlier();
        asked += 1;
        const seek = asked;
        waiting.push(() => resume(Effect.void));
        clock.seek(t);
        ended = false;
        if (inFlight) preview(t, seek);
        open(t, seek);
        hear(true);
      }),
    play: Effect.sync(() => {
      playing = true;
      // Let go while hidden, it opens again at the clock's time.
      if (Option.isNone(frames)) {
        asked += 1;
        open(time(), asked);
      }
      clock.play();
      startLoop();
      hear();
    }),
    pause: Effect.sync(() => {
      playing = false;
      clock.pause();
      haltLoop();
      hear();
    }),
    mute: (quiet) => {
      muted = quiet;
      hear();
    },
    rate: (rate) => {
      if (rate !== speed) clock.rate(rate);
      speed = rate;
      hear();
    },
    on: (event, listener, signal) => events.addEventListener(event, listener, { signal }),
    release: () => {
      haltLoop();
      drop();
      Option.map(shown, (f) => f.close());
      shown = Option.none();
      // A seek still waiting is done: nothing shows for it until the pane plays again.
      for (const resume of waiting.splice(0)) resume();
    },
  };
};
