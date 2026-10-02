// The synced player's driver: the media of a set (`Playable`s: live its
// `<video>`s and `<audio>`s), made to do what the machine's state says, and
// what they do told back to it as events. It reaches them only through the
// port (`browser/media.ts`), and plays them through `Media.playOrMute`. The
// first variant's video is the clock (its time is the set's); every other
// that drifts more than DRIFT_S from it is put back on it. Only the audible
// one is unmuted. A seek moves every video; a stall pauses them all until
// each has enough to play on (`Buffering`). The player's keys (space, ←/→)
// are heard here too, for every page with a synced player.

import { type Context, Data, Effect, Option } from 'effect';
import { Frames } from '../../browser/frames.ts';
import { Keys, type KeyPress } from '../../browser/keys.ts';
import { Media, type Playable } from '../../browser/media.ts';
import {
  type SyncEvent,
  SyncEvent as Events,
  STEP_S,
  type SyncState,
  runningOf,
} from './machine.ts';

/** How far a video may drift from the clock before it is put back on it, in seconds. */
const DRIFT_S = 0.2;

/** How far the clock moves before the machine hears of it, in seconds. */
const TICK_S = 0.05;

/** Whether `video` has drifted from the clock at `t` far enough to be put back. */
export const drifted = (video: number, t: number): boolean => Math.abs(video - t) > DRIFT_S;

export interface SyncDriver {
  /** A variant's video joins the set: it takes the clock, the rate and the sound as they are. */
  readonly attach: (id: string, video: Playable) => void;
  /** Its card is gone. */
  readonly detach: (id: string) => void;
  /** The machine's state, made so. */
  readonly apply: (state: SyncState) => void;
  /** Every video paused, every listener and the clock's loop stopped. */
  readonly stop: () => void;
}

interface Attached {
  readonly video: Playable;
  readonly listening: AbortController;
}

/**
 * The driver of a set whose clock is the video of `first`, telling the
 * machine through `send`.
 */
export const makeSync = (
  first: string,
  send: (event: SyncEvent) => void,
  host: Context.Context<Frames | Media>,
): SyncDriver => {
  const videos = new Map<string, Attached>();
  let current = Option.none<SyncState>();
  let seek = -1;
  let told = -1;
  /** The stop of the clock's loop, while it runs. */
  let looping = Option.none<() => void>();

  const all = () => [...videos.values()].map((a) => a.video);
  const clock = () =>
    Option.orElse(
      Option.map(Option.fromUndefinedOr(videos.get(first)), (a) => a.video),
      () => Option.fromUndefinedOr(all()[0]),
    );

  /** Do `effect` on the host, without waiting for it. */
  const fork = (effect: Effect.Effect<unknown, never, Frames | Media>) => {
    Effect.runForkWith(host)(effect);
  };
  /**
   * Play `video`; a browser that will not play sound unasked plays it muted
   * (any other refusal, a pause before it started, is left as it is).
   */
  const play = (video: Playable) => fork(Media.use((media) => media.playOrMute(video)));
  const seekTo = (video: Playable, t: number) => fork(video.seek(t));

  const hear = (state: SyncState) => {
    for (const [id, a] of videos) {
      a.video.mute(id !== state.audible);
      a.video.rate(state.rate);
    }
  };

  /**
   * Each frame while it runs: tell the machine the clock's time, and pull
   * drifters back; on while the set plays or waits for its videos.
   */
  const step = (): boolean =>
    Option.exists(current, (state) => {
      Option.map(clock(), (master) => {
        const t = master.time();
        if (state._tag === 'Buffering') {
          if (all().every((v) => v.ready())) send(Events.Resumed);
          return;
        }
        if (Math.abs(t - told) >= TICK_S) {
          told = t;
          send(Events.Ticked({ t }));
        }
        for (const video of all()) {
          if (video === master || video.seeking() || video.ended()) continue;
          if (t < video.duration() && drifted(video.time(), t)) seekTo(video, t);
        }
      });
      return Option.exists(current, (now) => runningOf(now) || now._tag === 'Buffering');
    });

  const run = () => {
    if (Option.isSome(looping)) return;
    // A loop that ends forgets its stop only while it is still the loop running.
    const stop = Effect.runCallbackWith(host)(
      Frames.use((frames) => frames.loop(step)),
      {
        onExit: () => {
          if (Option.exists(looping, (running) => running === stop)) looping = Option.none();
        },
      },
    );
    looping = Option.some(stop);
  };
  const halt = () => {
    Option.map(looping, (stop) => stop());
    looping = Option.none();
  };

  const apply = (state: SyncState) => {
    current = Option.some(state);
    hear(state);
    if (state.seek !== seek) {
      seek = state.seek;
      told = state.t;
      for (const video of all()) seekTo(video, state.t);
    }
    if (runningOf(state)) {
      for (const video of all()) if (!video.playing()) play(video);
      run();
      return;
    }
    for (const video of all()) fork(video.pause);
    if (state._tag === 'Buffering') {
      run();
      return;
    }
    halt();
  };

  const attach = (id: string, video: Playable) => {
    Option.map(Option.fromUndefinedOr(videos.get(id)), (old) => old.listening.abort());
    const listening = new AbortController();
    const signal = listening.signal;
    videos.set(id, { video, listening });
    video.on(
      'measured',
      () => {
        if (id === first && Number.isFinite(video.duration()))
          send(Events.Measured({ end: video.duration() }));
        Option.map(current, (state) => seekTo(video, state.t));
      },
      signal,
    );
    video.on('stalled', () => send(Events.Stalled), signal);
    video.on(
      'ended',
      () => {
        if (id === first) send(Events.Ended);
      },
      signal,
    );
    Option.map(current, (state) => {
      hear(state);
      seekTo(video, state.t);
      if (runningOf(state)) play(video);
    });
  };

  const detach = (id: string) => {
    Option.map(Option.fromUndefinedOr(videos.get(id)), (a) => {
      a.listening.abort();
      fork(a.video.pause);
    });
    videos.delete(id);
  };

  const stop = () => {
    halt();
    for (const id of [...videos.keys()]) detach(id);
  };

  return { attach, detach, apply, stop };
};

/** What a key press asks of a synced player: play or pause (space), or a step back or on (←/→). */
export type PlayerKey = Data.TaggedEnum<{
  Toggle: {};
  Step: { readonly by: number };
}>;
export const PlayerKey = Data.taggedEnum<PlayerKey>();

/** ←/→: a step back or on. */
const ARROWS = new Map([
  ['ArrowRight', 1],
  ['ArrowLeft', -1],
]);

/** The player's ask in a key press: none for a key typed into a field, held with a modifier, or not the player's. */
const playerKey = (e: KeyPress): Option.Option<PlayerKey> => {
  if (e.typing || e.meta || e.ctrl || e.alt) return Option.none();
  if (e.key === ' ') return Option.some(PlayerKey.Toggle());
  return Option.map(Option.fromUndefinedOr(ARROWS.get(e.key)), (by) => PlayerKey.Step({ by }));
};

/** The machine's event for a player key: a toggle, or a step of STEP_S seconds. */
export const playerEvent = (key: PlayerKey): SyncEvent =>
  PlayerKey.$match(key, {
    Toggle: () => Events.Toggled,
    Step: ({ by }) => Events.Stepped({ by: by * STEP_S }),
  });

/**
 * Hear the page's key presses for a synced player until interrupted: `take`
 * gets each of the player's keys and answers whether it took it (its default
 * is then prevented). The one place the review's players listen to the
 * keyboard.
 */
export const playerKeys = (take: (key: PlayerKey) => boolean): Effect.Effect<never, never, Keys> =>
  Keys.use((keys) => keys.listen((press) => Option.exists(playerKey(press), take)));
