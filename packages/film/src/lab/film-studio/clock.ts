// The studio's clock: the time the playhead is at, playing or not. Two
// sources keep it. The staged film's preview (`playerClock`, over
// `player/main.ts`'s `Player`) plays the version the lab's film registry
// holds, its narration heard. Any other version (a version kept in its own
// folder) has no staged film, so a silent clock (`silentClock`, on the
// host's frames and monotonic time) runs its timeline with no sound. The
// page reads one interface and never knows which.

import { Effect, Fiber, Option } from 'effect';
import { type Host, monotonicMs } from '../../browser/host.ts';
import { Frames } from '../../browser/frames.ts';
import type { Player } from '../../player/main.ts';

/** The studio's time source. */
export interface StudioClock {
  /** Film seconds at the playhead. */
  readonly now: () => number;
  readonly playing: () => boolean;
  /** Show `T` and settle there. */
  readonly seek: (T: number) => void;
  /** Show `T` as a drag passes through it; the drag ends with `settle`. */
  readonly scrub: (T: number) => void;
  readonly settle: () => void;
  readonly play: () => void;
  readonly pause: () => void;
  /** Called with T at every move (a seek, a scrub, each frame played), until the returned stop. */
  readonly onMove: (listener: (T: number) => void) => () => void;
  /** Called each time it starts or stops playing (the film's end stops it), until the returned stop. */
  readonly onPlaying: (listener: (playing: boolean) => void) => () => void;
  /** Stop playing and hearing: the page leaves this source. */
  readonly close: () => void;
}

/** Listeners of one kind, each called with every value until it is taken back. */
const listeners = <A>() => {
  const all = new Set<(a: A) => void>();
  return {
    add: (listener: (a: A) => void) => {
      all.add(listener);
      return () => {
        all.delete(listener);
      };
    },
    tell: (a: A) => {
      for (const listener of all) listener(a);
    },
  };
};

/** The staged film's clock: the preview's own time, play and narration. */
export const playerClock = (player: Player): StudioClock => {
  const playingHeard = listeners<boolean>();
  let was = player.playing();
  // The preview stops by itself at the film's end: heard on its next move.
  const heard = () => {
    const now = player.playing();
    if (now === was) return;
    was = now;
    playingHeard.tell(now);
  };
  const stopHearing = player.onMove(heard);
  return {
    now: () => player.now(),
    playing: () => player.playing(),
    seek: (T) => player.seek(T),
    scrub: (T) => player.scrub(T),
    settle: () => player.settle(),
    play: () => {
      player.play();
      heard();
    },
    pause: () => {
      player.pause();
      heard();
    },
    onMove: (listener) => player.onMove(listener),
    onPlaying: playingHeard.add,
    close: () => {
      player.pause();
      stopHearing();
    },
  };
};

/**
 * A silent clock over `duration` film seconds, starting at `from`: played on
 * the host's animation frames, timed by its monotonic clock (the page's
 * `performance.now`, a test's clock in a test), stopping at the end.
 */
export const silentClock = (host: Host, duration: number, from: number): StudioClock => {
  const moved = listeners<number>();
  const playingHeard = listeners<boolean>();
  const ms = monotonicMs(host);
  const end = Math.max(0, duration);
  let T = Math.min(Math.max(0, from), end);
  let running: Option.Option<Fiber.Fiber<void>> = Option.none();
  const move = (to: number) => {
    T = Math.min(Math.max(0, to), end);
    moved.tell(T);
  };
  const stop = () => {
    if (Option.isNone(running)) return;
    const fiber = running.value;
    running = Option.none();
    Effect.runFork(Fiber.interrupt(fiber));
    playingHeard.tell(false);
  };
  const play = () => {
    if (Option.isSome(running)) return;
    if (T >= end) move(0);
    const started = ms();
    const at = T;
    running = Option.some(
      Effect.runForkWith(host)(
        Frames.use((frames) =>
          frames.loop(() => {
            move(at + (ms() - started) / 1000);
            if (T < end) return true;
            stop();
            return false;
          }),
        ),
      ),
    );
    playingHeard.tell(true);
  };
  return {
    now: () => T,
    playing: () => Option.isSome(running),
    seek: (to) => {
      const wasPlaying = Option.isSome(running);
      stop();
      move(to);
      if (wasPlaying) play();
    },
    scrub: move,
    settle: () => {},
    play,
    pause: stop,
    onMove: moved.add,
    onPlaying: playingHeard.add,
    close: stop,
  };
};
