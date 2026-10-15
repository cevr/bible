// The tests' time budget, judged: each workspace's `test` and the whole of
// `bun run test` under 10 seconds, read beside the machine's load before the
// run. A machine busier than its cores (a load average above its core count)
// times the other work as much as the tests, so its run is not a measure:
// it says so, names the load, and passes, and the merge step measures again
// on a quiet machine. At or below the core count, a run over budget fails.

/** The budget, in milliseconds, for the whole run and for each workspace's `test`. */
const BUDGET_MS = 10_000;

/** One thing timed: a workspace's `test`, or the whole run. */
interface Timed {
  readonly name: string;
  readonly ms: number;
}

/** A run as it was timed, with the machine's load average before it and its core count. */
interface Run {
  /** Each workspace's `test`. */
  readonly tasks: ReadonlyArray<Timed>;
  /** The whole of `bun run test`. */
  readonly wall: number;
  readonly load: number;
  readonly cores: number;
}

/** What the budget says of a run: the report to print, what to print as the failure, and the exit code. */
interface Judged {
  readonly report: ReadonlyArray<string>;
  readonly failure: ReadonlyArray<string>;
  readonly code: 0 | 1;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** The budget's verdict on `run`. */
export const judge = (run: Run): Judged => {
  const tasks = run.tasks.toSorted((a, b) => b.ms - a.ms);
  const over = [...tasks, { name: 'bun run test', ms: run.wall }].filter(
    (task) => task.ms >= BUDGET_MS,
  );
  const report = [
    '',
    `test:budget: under ${seconds(BUDGET_MS)} each (load average ${run.load.toFixed(1)} before it, on ${run.cores} cores)`,
    ...tasks.map((task) => `  ${seconds(task.ms).padStart(7)}  ${task.name}`),
    `  ${seconds(run.wall).padStart(7)}  bun run test`,
  ];
  if (run.load > run.cores)
    return {
      report: [
        ...report,
        `test:budget: not measured (load ${run.load.toFixed(1)} on ${run.cores} cores)`,
      ],
      failure: [],
      code: 0,
    };
  if (over.length === 0) return { report, failure: [], code: 0 };
  return {
    report,
    failure: [
      `test:budget: over budget: ${over.map((task) => `${task.name} ${seconds(task.ms)}`).join(', ')}.`,
      'A test that waits on real time, a setup each test repeats, or one long file a worker runs alone is the usual cause.',
    ],
    code: 1,
  };
};
