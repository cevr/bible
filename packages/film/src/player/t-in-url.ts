// `#T` in the URL: the one place a reload reads T from, written only through
// this. While T moves (play, a drag) it is written at most once per period;
// when T settles (a seek, the end of a drag, a pause, the film's end) it is
// written at once. When the lab asks for a write, which reloads the page, it
// is written at once and held there until T next settles, so the reload lands
// on the frame the write was made at. (`pagehide` cannot do this: a URL
// written during it does not reach the reload.)

import { type Throttled, browserTimers, throttled } from './throttle.ts';

/**
 * `T` as `#T` writes it: to the millisecond, rounded up, so a reload reads it
 * back in its own frame and never before it. A scene's start that falls
 * between two hundredths (`]` seeks there exactly) would read back in the
 * scene before. The nudge below 1e-6 keeps a time already on the grid as
 * itself, so reload after reload never creeps.
 */
export const tInHash = (T: number): string => (Math.ceil(T * 1000 - 1e-6) / 1000).toFixed(3);

interface TInUrl {
  /** T moved: write it, at most once per period. Held, nothing. */
  moved(): void;
  /** T settled: write it now, and let T move the URL again. */
  settled(): void;
  /** A write is on its way, and the page will reload: write T now, and keep it there. */
  held(): void;
}

export const tInUrl = (write: () => void, everyMs: number, timers = browserTimers): TInUrl => {
  const moving: Throttled = throttled(write, everyMs, timers);
  let holding = false;
  const now = () => {
    moving.ran();
    write();
  };
  return {
    moved() {
      if (!holding) moving.request();
    },
    settled() {
      holding = false;
      now();
    },
    held() {
      holding = true;
      now();
    },
  };
};
