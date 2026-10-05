// A clock the player's tests move by hand (`Timers`, `throttle.ts`): its
// time, and the timers it would fire, fired in order as it moves past them.

import type { Timers } from '../throttle.ts';

/** A clock the test moves by hand, with the timers it would fire. */
export const fakeTimers = () => {
  let now = 0;
  let next = 1;
  const due = new Map<number, { at: number; run: () => void }>();
  const timers: Timers = {
    now: () => now,
    set: (run, ms) => {
      const id = next++;
      due.set(id, { at: now + ms, run });
      return id;
    },
    clear: (id) => {
      due.delete(id);
    },
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, t] of [...due].sort((a, b) => a[1].at - b[1].at))
      if (t.at <= now) {
        due.delete(id);
        t.run();
      }
  };
  return { timers, advance, pending: () => due.size };
};
