// The tests' time budget, judged: each workspace's `test`, run alone, under
// 1 second wall: 1,000 ms or more is over. There is no budget on the sum:
// the workspaces are separate projects, and one's verdict never depends on
// another's (owner, 2026-10-18: "should not ahve their tests and budgets
// entangled").
//
// The times are read beside the machine's 1- and 5-minute load averages
// before the first workspace ran: what else was running, not the run's own (a
// workspace's run lifts the average the next one would read). A machine
// busier than its cores (either average above its core count) times the other
// work as much as the tests, so its run is not a measure: it says so, names
// both averages, and passes; nothing measures it again. The 5-minute average
// keeps a lull of a minute in a busy period from admitting the run. At or
// below the core count, a workspace over budget fails. A workspace whose
// tests fail fails the run at any load, and so does one with no time (its own
// summary did not read): its line names its exit code and no time. A run that
// fails exits 1; every other run exits 0, a busy machine's included.

import { Option } from 'effect';

/** The budget, in milliseconds, for each workspace's `test`. */
const BUDGET_MS = 1_000;

/** One workspace's `test`, run alone: its time (none when its own summary did not read) and its exit code. */
interface Workspace {
  readonly name: string;
  readonly ms: Option.Option<number>;
  readonly exitCode: number;
}

/** A workspace that has a time. */
interface Timed {
  readonly name: string;
  readonly ms: number;
  readonly exitCode: number;
}

/** The workspaces as they were timed, one after another, with the load averages before the first and the core count. */
interface Run {
  readonly workspaces: ReadonlyArray<Workspace>;
  readonly load: Load;
  readonly cores: number;
}

/** The 1- and 5-minute load averages. */
interface Load {
  readonly one: number;
  readonly five: number;
}

/** What the budget says of a run: the report to print, what to print as the failure, and the exit code. */
interface Judged {
  readonly report: ReadonlyArray<string>;
  readonly failure: ReadonlyArray<string>;
  readonly code: 0 | 1;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

const averages = (load: Load) =>
  `${load.one.toFixed(1)} over 1 min and ${load.five.toFixed(1)} over 5 min`;

/** Whether the machine was at or below its cores by both averages before the run. */
const quiet = (run: Run) => run.load.one <= run.cores && run.load.five <= run.cores;

/** The budget's verdict on `run`. */
export const judge = (run: Run): Judged => {
  const timed = run.workspaces
    .flatMap((workspace): ReadonlyArray<Timed> =>
      Option.match(workspace.ms, {
        onNone: () => [],
        onSome: (ms) => [{ ...workspace, ms }],
      }),
    )
    .toSorted((a, b) => b.ms - a.ms);
  const untimed = run.workspaces
    .filter((workspace) => Option.isNone(workspace.ms))
    .toSorted((a, b) => a.name.localeCompare(b.name));
  const measured = quiet(run);
  const passed = timed.filter((workspace) => workspace.exitCode === 0);
  const over = passed.filter((workspace) => measured && workspace.ms >= BUDGET_MS);
  const report = [
    '',
    `test:budget: each workspace alone, under ${seconds(BUDGET_MS)} (load average ${averages(run.load)} before them, on ${run.cores} cores)`,
    ...timed.map((workspace) => `  ${seconds(workspace.ms).padStart(7)}  ${workspace.name}`),
    ...untimed.map(
      (workspace) =>
        `  no time  ${workspace.name}: exit ${workspace.exitCode}, its own summary did not read`,
    ),
    ...notMeasured(run),
  ];
  const failure = [
    ...testsFailed(run.workspaces.filter((workspace) => workspace.exitCode !== 0)),
    ...noTime(untimed),
    ...overBudget(over),
  ];
  if (failure.length > 0) return { report, failure, code: 1 };
  return { report, failure, code: 0 };
};

const notMeasured = (run: Run): ReadonlyArray<string> => {
  if (quiet(run)) return [];
  return [`test:budget: not measured (load average ${averages(run.load)}, on ${run.cores} cores)`];
};

const testsFailed = (workspaces: ReadonlyArray<Workspace>): ReadonlyArray<string> => {
  if (workspaces.length === 0) return [];
  const each = workspaces.map((workspace) => `${workspace.name} (exit ${workspace.exitCode})`);
  return [`test:budget: tests failed: ${each.join(', ')}.`];
};

const noTime = (workspaces: ReadonlyArray<Workspace>): ReadonlyArray<string> => {
  if (workspaces.length === 0) return [];
  const each = workspaces.map((workspace) => workspace.name);
  return [`test:budget: no time measured: ${each.join(', ')}; its own summary did not read.`];
};

const overBudget = (workspaces: ReadonlyArray<Timed>): ReadonlyArray<string> => {
  if (workspaces.length === 0) return [];
  const each = workspaces.map((workspace) => `${workspace.name} ${seconds(workspace.ms)}`);
  return [
    `test:budget: over budget: ${each.join(', ')}.`,
    'A test that waits on real time, a setup each test repeats, or one long file a worker runs alone is the usual cause.',
    'Measure a workspace again, alone, with `bun run test:budget <workspace>`.',
  ];
};
