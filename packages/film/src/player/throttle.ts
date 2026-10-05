// A write the player may ask for every frame but makes at most once per
// period: the first request runs at once, later ones within the period wait
// for one trailing run that carries the latest state; `ran` drops a waiting
// write after a write made outside (`tInUrl` writes
// `#t=` through this). The timers are injectable: live they are the page
// host's `Clock` (`timersOn`), and the policy is tested on a clock the test
// moves.

import { Effect, Exit, Option } from 'effect';
import type { Context } from 'effect';
import { monotonicMs } from '../browser/host.ts';

/** The clock and timer calls `throttled` uses. */
export interface Timers {
  readonly now: () => number;
  readonly set: (run: () => void, ms: number) => number;
  readonly clear: (id: number) => void;
}

export interface Throttled {
  /** Ask for a write: now if the period has passed, else once when it does. */
  request(): void;
  /** Drop a waiting write, and count a write made just now outside it. */
  ran(): void;
}

/** The timers of `host`'s `Clock`: its monotonic time, and a sleep on it per timer. */
export const timersOn = <S>(host: Context.Context<S>): Timers => {
  const now = monotonicMs(host);
  const pending = new Map<number, () => void>();
  let next = 1;
  return {
    now,
    set: (run, ms) => {
      const id = next++;
      pending.set(
        id,
        Effect.runCallbackWith(host)(Effect.sleep(ms), {
          onExit: (exit) => {
            pending.delete(id);
            if (Exit.isSuccess(exit)) run();
          },
        }),
      );
      return id;
    },
    clear: (id) => {
      Option.map(Option.fromUndefinedOr(pending.get(id)), (stop) => stop());
      pending.delete(id);
    },
  };
};

export const throttled = (run: () => void, everyMs: number, timers: Timers): Throttled => {
  let last = Number.NEGATIVE_INFINITY;
  let waiting: number | undefined;
  const fire = () => {
    waiting = undefined;
    last = timers.now();
    run();
  };
  return {
    request() {
      if (waiting !== undefined) return;
      const wait = last + everyMs - timers.now();
      if (wait <= 0) fire();
      else waiting = timers.set(fire, wait);
    },
    ran() {
      if (waiting !== undefined) timers.clear(waiting);
      waiting = undefined;
      last = timers.now();
    },
  };
};
