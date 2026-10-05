// The page's clock for the browser tests: timers, animation frames, `Date`
// and `performance.now` replaced before the page's own scripts run, so a
// test moves the page's time on (`runFor`, `fastForward`, `pauseAt`) rather
// than wait it out. Installed, the clock runs on with real time: a timer
// fires when its time comes, through one real timer for the earliest due.
// `runFor(ms)` runs every timer and frame due in the next `ms`, in order, at
// its own time; `fastForward(ms)` jumps there and fires what fell due once;
// `pauseAt(t)` jumps to the epoch time `t` and stops the clock, which then
// moves only as the test runs it, until `resume()` runs it on with real time
// from where it stands. Animation frames are timers on the 16 ms
// grid. Audio runs on its own, real, clock. The real timers stay reachable
// under `REAL_TIMERS`, for the tab's own waits (`tab.ts`).
//
// The clock is a script the page runs, as the harness's other page scripts
// are: it reaches only the page's globals.

/** The global the page's real timers are kept under: `globalThis[Symbol.for(REAL_TIMERS)]`. */
export const REAL_TIMERS = 'film.realTimers';

/** The global the clock's controls are under: `globalThis[Symbol.for(CLOCK)]`. */
export const CLOCK = 'film.clock';

export const CLOCK_SCRIPT = `(() => {
  const real = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    now: Date.now,
    perf: performance.now.bind(performance),
    Date,
  };
  globalThis[Symbol.for('${REAL_TIMERS}')] = real;

  // Every pending timer and frame: when it is due, and every how long it repeats (0: once).
  const timers = new Map();
  let next = 1;
  let paused = false;
  // The clock reads \`base\` plus the real time since \`since\`, or \`held\` when paused.
  let base = real.now();
  let since = real.perf();
  let held = 0;
  const startEpoch = base;
  const startPerf = since;
  const now = () => (paused ? held : base + (real.perf() - since));
  const setNow = (t) => {
    if (paused) held = t;
    else {
      base = t;
      since = real.perf();
    }
  };
  const perfNow = () => now() - startEpoch + startPerf;

  // A timer's error is the page's, thrown on a real timer of its own so the run goes on.
  const runOne = (t) => {
    try {
      t.run(now());
    } catch (error) {
      real.setTimeout(() => {
        throw error;
      }, 0);
    }
  };

  let pump;
  const earliest = (upTo) => {
    let first;
    for (const t of timers.values())
      if (t.at <= upTo && (first === undefined || t.at < first.at || (t.at === first.at && t.id < first.id)))
        first = t;
    return first;
  };
  const fire = (t) => {
    if (t.every > 0) t.at += t.every;
    else timers.delete(t.id);
    runOne(t);
  };
  const runDue = (upTo) => {
    for (let t = earliest(upTo); t !== undefined; t = earliest(upTo)) {
      setNow(Math.max(now(), t.at));
      fire(t);
    }
  };
  const schedule = () => {
    if (pump !== undefined) real.clearTimeout(pump);
    pump = undefined;
    if (paused) return;
    const first = earliest(Number.POSITIVE_INFINITY);
    if (first === undefined) return;
    pump = real.setTimeout(() => {
      pump = undefined;
      runDue(now());
      schedule();
    }, Math.max(0, first.at - now()));
  };
  const add = (at, every, run) => {
    const id = next++;
    timers.set(id, { id, at, every, run });
    schedule();
    return id;
  };
  const clear = (id) => {
    timers.delete(id);
  };
  const call = (handler, args) => () => {
    if (typeof handler === 'function') handler(...args);
  };

  Object.assign(globalThis, {
    setTimeout: (handler, ms, ...args) => add(now() + Math.max(0, Number(ms) || 0), 0, call(handler, args)),
    setInterval: (handler, ms, ...args) => {
      const every = Math.max(1, Number(ms) || 0);
      return add(now() + every, every, call(handler, args));
    },
    clearTimeout: clear,
    clearInterval: clear,
    requestAnimationFrame: (callback) =>
      add(now() + (16 - ((now() - startEpoch) % 16)), 0, () => callback(perfNow())),
    cancelAnimationFrame: clear,
  });

  function FakeDate(...args) {
    if (new.target === undefined) return new real.Date(now()).toString();
    if (args.length === 0) return new real.Date(now());
    return Reflect.construct(real.Date, args);
  }
  FakeDate.prototype = real.Date.prototype;
  Object.assign(FakeDate, { now: () => Math.floor(now()), parse: real.Date.parse, UTC: real.Date.UTC });
  globalThis.Date = FakeDate;
  Object.defineProperty(performance, 'now', { value: perfNow, configurable: true });

  // Jump to \`to\`, firing each timer due by then once, in order.
  const jump = (to) => {
    const due = [...timers.values()].filter((t) => t.at <= to).sort((a, b) => a.at - b.at || a.id - b.id);
    setNow(to);
    for (const t of due) {
      if (!timers.has(t.id)) continue;
      if (t.every > 0) t.at = to + t.every;
      else timers.delete(t.id);
      runOne(t);
    }
  };
  globalThis[Symbol.for('${CLOCK}')] = {
    runFor: (ms) => {
      const to = now() + ms;
      runDue(to);
      setNow(to);
      schedule();
    },
    fastForward: (ms) => {
      jump(now() + ms);
      schedule();
    },
    pauseAt: (t) => {
      jump(t);
      held = now();
      paused = true;
      schedule();
    },
    resume: () => {
      if (!paused) return;
      base = held;
      since = real.perf();
      paused = false;
      schedule();
    },
  };
})()`;
