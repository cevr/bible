// A write the player may ask for every frame but makes at most once per
// period: the first request runs at once, later ones within the period wait
// for one trailing run that carries the latest state, and `flush` runs a
// waiting write now (the player flushes when T settles: pause, the end of a
// seek, pagehide). The timers are injectable so the policy is tested on a
// clock the test moves.

/** The clock and timer calls `throttled` uses. */
export interface Timers {
  readonly now: () => number;
  readonly set: (run: () => void, ms: number) => number;
  readonly clear: (id: number) => void;
}

export interface Throttled {
  /** Ask for a write: now if the period has passed, else once when it does. */
  request(): void;
  /** Run a waiting write now; nothing when none waits. */
  flush(): void;
  /** Drop a waiting write, and count a write made just now outside it. */
  ran(): void;
}

export const browserTimers: Timers = {
  now: () => performance.now(),
  set: (run, ms) => window.setTimeout(run, ms),
  clear: (id) => window.clearTimeout(id),
};

export const throttled = (run: () => void, everyMs: number, timers = browserTimers): Throttled => {
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
    flush() {
      if (waiting === undefined) return;
      timers.clear(waiting);
      fire();
    },
    ran() {
      if (waiting !== undefined) timers.clear(waiting);
      waiting = undefined;
      last = timers.now();
    },
  };
};
