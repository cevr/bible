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
// key frames are 2 s apart. The panes of a compare play in lockstep
// (`lockstep`): each frame drawn, either every pane shows the frame its time
// asks for or none does, so a slow decoder holds the set and the panes never
// show different frames. Hidden (`hide`), a pane stands: its clock stops,
// its sound stops, its decoder and any frame still decoding are let go;
// shown again (`show`), it draws the frame at the clock's time afresh and
// plays on if it was playing. Its sound (`AudioOut`) is heard only unmuted,
// playing, at 1×: a buffer played at another rate changes pitch, as the
// narration's rule has it.

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

/** A pane: a `Playable`, which stands while the page is hidden. */
export interface Pane extends Playable {
  /** Hidden: it stands, silent, its decoder and its frames let go. */
  readonly hide: () => void;
  /** Shown again: the frame at the clock's time drawn afresh, playing on if it was. */
  readonly show: () => void;
}

/** A pane as the lockstep it plays in sees it, each frame drawn. */
interface Member {
  /** Playing and shown: held to the others. */
  readonly live: () => boolean;
  /** It has what its time asks for: the frame due decoded, or no frame due. */
  readonly inStep: () => boolean;
  /** Show the frame due when `together` (every live pane is in step); say if it ended or stalled. */
  readonly step: (together: boolean) => void;
}

/** The panes of one compare, drawn frame for frame together. */
interface Lockstep {
  readonly join: (member: Member) => void;
  /** A pane started or stopped playing, or hid or showed: run the frames while any is live. */
  readonly wake: () => void;
}

/**
 * The lockstep of a compare's panes over `loop` (each animation frame, until
 * its step answers false): each frame, if every live pane has the frame its
 * time asks for, each shows it; if any lacks it, none moves on.
 */
export const lockstep = (loop: (step: () => boolean) => () => void): Lockstep => {
  const members = new Set<Member>();
  let stop = Option.none<() => void>();
  const live = () => [...members].filter((m) => m.live());
  const step = (): boolean => {
    const playing = live();
    if (playing.length === 0) {
      stop = Option.none();
      return false;
    }
    const together = playing.every((m) => m.inStep());
    for (const m of playing) m.step(together);
    return true;
  };
  return {
    join: (member) => {
      members.add(member);
    },
    wake: () => {
      if (live().length === 0) {
        Option.map(stop, (halt) => halt());
        stop = Option.none();
        return;
      }
      if (Option.isNone(stop)) stop = Option.some(loop(step));
    },
  };
};

interface PaneOptions {
  readonly source: FrameSource;
  /** The clock every pane of the compare reads. */
  readonly clock: MediaClock;
  /** The lockstep every pane of the compare plays in. */
  readonly together: Lockstep;
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

/** A pane over `source`, on `clock`, in `together`. */
export const paneOver = ({ source, clock, together, audio }: PaneOptions): Pane => {
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
  /** The page is hidden: the pane stands until it is shown. */
  let hidden = false;

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

  /** The sound heard only shown, unmuted, playing, at 1×; heard again from here after a seek. */
  const hear = (again = false) =>
    Option.map(audio, (out) => {
      const want = playing && !hidden && !muted && speed === 1;
      if (heard && (!want || again)) {
        out.stop();
        heard = false;
      }
      if (want && !heard) {
        out.start(time(), speed);
        heard = true;
      }
    });

  /** The frame decoded and due at `t`, if any. */
  const dueAt = (t: number) => Option.filter(next, (f) => f.timestamp <= t + DUE_S);

  /**
   * Whether it has what its time asks for: done seeking, and the frame due
   * decoded, or the one shown still showing (or its frames run out).
   */
  const inStep = () => {
    const t = time();
    const wants =
      !exhausted &&
      Option.match(shown, {
        onNone: () => true,
        onSome: (f) => t + DUE_S >= f.timestamp + f.duration,
      });
    return settled === asked && (Option.isSome(dueAt(t)) || !wants);
  };

  /** Each frame while live: show the frame due when every pane can (`together`); say when it ends or stalls. */
  const step = (together: boolean) => {
    const t = time();
    Option.map(
      Option.filter(dueAt(t), () => together),
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
  };

  together.join({ live: () => playing && !hidden, inStep, step });

  /** Every frame shown or decoding let go, and every seek waiting done: a decode that lands later is never drawn. */
  const letGo = () => {
    asked += 1;
    settled = asked;
    drop();
    Option.map(shown, (f) => f.close());
    shown = Option.none();
    for (const resume of waiting.splice(0)) resume();
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
        clock.seek(t);
        ended = false;
        // Hidden, it decodes nothing: the frame at the clock's time is drawn once it is shown.
        if (hidden) {
          asked += 1;
          settled = asked;
          resume(Effect.void);
          return;
        }
        asked += 1;
        const seek = asked;
        waiting.push(() => resume(Effect.void));
        if (inFlight) preview(t, seek);
        open(t, seek);
        hear(true);
      }),
    play: Effect.sync(() => {
      playing = true;
      if (hidden) return;
      // Never opened yet, it opens at the clock's time.
      if (Option.isNone(frames)) {
        asked += 1;
        open(time(), asked);
      }
      clock.play();
      together.wake();
      hear();
    }),
    pause: Effect.sync(() => {
      playing = false;
      clock.pause();
      together.wake();
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
    hide: () => {
      hidden = true;
      clock.pause();
      together.wake();
      hear();
      letGo();
    },
    show: () => {
      if (!hidden) return;
      hidden = false;
      asked += 1;
      open(time(), asked);
      if (playing) clock.play();
      together.wake();
      hear();
    },
  };
};
