// The synced player's driver: the `<video>`s (and `<audio>`s) of a set, made to do what the
// machine's state says, and what they do told back to it as events. The
// first variant's video is the clock (its time is the set's); every other
// that drifts more than DRIFT_S from it is put back on it. Only the audible
// one is unmuted. A seek moves every video; a stall pauses them all until
// each has enough to play on (`Buffering`).

import { type Cause, Effect, Option } from 'effect';
import { type SyncEvent, SyncEvent as Events, type SyncState, runningOf } from './machine.ts';

/** How far a video may drift from the clock before it is put back on it, in seconds. */
const DRIFT_S = 0.2;

/** How far the clock moves before the machine hears of it, in seconds. */
const TICK_S = 0.05;

/** A video that can play on without waiting: `HAVE_FUTURE_DATA` or more. */
const READY = 3;

/** Whether a refused `play()` was the browser's rule against sound nobody asked for. */
const refusedSound = (error: Cause.UnknownError) =>
  error.cause instanceof DOMException && error.cause.name === 'NotAllowedError';

/** Whether `video` has drifted from the clock at `t` far enough to be put back. */
export const drifted = (video: number, t: number): boolean => Math.abs(video - t) > DRIFT_S;

export interface SyncDriver {
  /** A variant's video joins the set: it takes the clock, the rate and the sound as they are. */
  readonly attach: (id: string, video: HTMLMediaElement) => void;
  /** Its card is gone. */
  readonly detach: (id: string) => void;
  /** The machine's state, made so. */
  readonly apply: (state: SyncState) => void;
  /** Every video paused, every listener and the clock's loop stopped. */
  readonly stop: () => void;
}

interface Attached {
  readonly video: HTMLMediaElement;
  readonly listening: AbortController;
}

/**
 * The driver of a set whose clock is the video of `first`, telling the
 * machine through `send`.
 */
export const makeSync = (first: string, send: (event: SyncEvent) => void): SyncDriver => {
  const videos = new Map<string, Attached>();
  let current = Option.none<SyncState>();
  let seek = -1;
  let told = -1;
  let frame = Option.none<number>();

  const all = () => [...videos.values()].map((a) => a.video);
  const clock = () =>
    Option.orElse(
      Option.map(Option.fromUndefinedOr(videos.get(first)), (a) => a.video),
      () => Option.fromUndefinedOr(all()[0]),
    );

  /**
   * Play `video`; a browser that will not play sound unasked plays it muted
   * (any other refusal, a pause before it started, is left as it is).
   */
  const play = (video: HTMLMediaElement) =>
    Effect.runFork(
      Effect.tryPromise(() => video.play()).pipe(
        Effect.catch((error) => {
          if (!refusedSound(error)) return Effect.void;
          video.muted = true;
          return Effect.ignore(Effect.tryPromise(() => video.play()));
        }),
      ),
    );

  const hear = (state: SyncState) => {
    for (const [id, a] of videos) {
      a.video.muted = id !== state.audible;
      a.video.playbackRate = state.rate;
    }
  };

  /** Each frame while it runs: tell the machine the clock's time, and pull drifters back. */
  const loop = () => {
    frame = Option.none();
    Option.map(current, (state) => {
      Option.map(clock(), (master) => {
        const t = master.currentTime;
        if (state._tag === 'Buffering') {
          if (all().every((v) => v.readyState >= READY)) send(Events.Resumed);
          return;
        }
        if (Math.abs(t - told) >= TICK_S) {
          told = t;
          send(Events.Ticked({ t }));
        }
        for (const video of all()) {
          if (video === master || video.seeking || video.ended) continue;
          if (t < video.duration && drifted(video.currentTime, t)) video.currentTime = t;
        }
      });
      if (runningOf(state) || state._tag === 'Buffering')
        frame = Option.some(requestAnimationFrame(loop));
    });
  };

  const run = () => {
    if (Option.isNone(frame)) frame = Option.some(requestAnimationFrame(loop));
  };
  const halt = () => {
    Option.map(frame, cancelAnimationFrame);
    frame = Option.none();
  };

  const apply = (state: SyncState) => {
    current = Option.some(state);
    hear(state);
    if (state.seek !== seek) {
      seek = state.seek;
      told = state.t;
      for (const video of all()) video.currentTime = state.t;
    }
    if (runningOf(state)) {
      for (const video of all()) if (video.paused) play(video);
      run();
      return;
    }
    for (const video of all()) video.pause();
    if (state._tag === 'Buffering') {
      run();
      return;
    }
    halt();
  };

  const attach = (id: string, video: HTMLMediaElement) => {
    Option.map(Option.fromUndefinedOr(videos.get(id)), (old) => old.listening.abort());
    const listening = new AbortController();
    const signal = listening.signal;
    videos.set(id, { video, listening });
    video.addEventListener(
      'loadedmetadata',
      () => {
        if (id === first && Number.isFinite(video.duration))
          send(Events.Measured({ end: video.duration }));
        Option.map(current, (state) => {
          video.currentTime = state.t;
        });
      },
      { signal },
    );
    video.addEventListener('waiting', () => send(Events.Stalled), { signal });
    video.addEventListener(
      'ended',
      () => {
        if (id === first) send(Events.Ended);
      },
      { signal },
    );
    Option.map(current, (state) => {
      hear(state);
      if (video.readyState > 0) video.currentTime = state.t;
      if (runningOf(state)) play(video);
    });
  };

  const detach = (id: string) => {
    Option.map(Option.fromUndefinedOr(videos.get(id)), (a) => {
      a.listening.abort();
      a.video.pause();
    });
    videos.delete(id);
  };

  const stop = () => {
    halt();
    for (const id of [...videos.keys()]) detach(id);
  };

  return { attach, detach, apply, stop };
};
