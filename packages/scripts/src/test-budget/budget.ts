// The tests' time budget, judged: each workspace's `test`, run alone, under
// 10 seconds wall. There is no budget on the sum: the workspaces are separate
// projects, and one's verdict never depends on another's (owner, 2026-10-18:
// "should not ahve their tests and budgets entangled").
//
// The times are read beside the machine's load average before the first
// workspace ran: what else was running, not the run's own (a workspace's run
// lifts the average the next one would read). A machine busier than its cores
// (a load average above its core count) times the other work as much as the
// tests, so its run is not a measure: it says so, names the load, and passes,
// and the merge step measures again on a quiet machine. At or below the core
// count, a workspace over budget fails. A workspace whose tests fail fails the
// run at any load.

/** The budget, in milliseconds, for each workspace's `test`. */
const BUDGET_MS = 10_000;

/** One workspace's `test`, run alone: its time and its exit code. */
interface Workspace {
  readonly name: string;
  readonly ms: number;
  readonly exitCode: number;
}

/** The workspaces as they were timed, one after another, with the load average before the first and the core count. */
interface Run {
  readonly workspaces: ReadonlyArray<Workspace>;
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
  const workspaces = run.workspaces.toSorted((a, b) => b.ms - a.ms);
  const measured = run.load <= run.cores;
  const passed = workspaces.filter((workspace) => workspace.exitCode === 0);
  const over = passed.filter((workspace) => measured && workspace.ms >= BUDGET_MS);
  const report = [
    '',
    `test:budget: each workspace alone, under ${seconds(BUDGET_MS)} (load average ${run.load.toFixed(1)} before them, on ${run.cores} cores)`,
    ...workspaces.map((workspace) => `  ${seconds(workspace.ms).padStart(7)}  ${workspace.name}`),
    ...notMeasured(run),
  ];
  const failure = [
    ...testsFailed(workspaces.filter((workspace) => workspace.exitCode !== 0)),
    ...overBudget(over),
  ];
  if (failure.length > 0) return { report, failure, code: 1 };
  return { report, failure, code: 0 };
};

const notMeasured = (run: Run): ReadonlyArray<string> => {
  if (run.load <= run.cores) return [];
  return [`test:budget: not measured (load ${run.load.toFixed(1)} on ${run.cores} cores)`];
};

const testsFailed = (workspaces: ReadonlyArray<Workspace>): ReadonlyArray<string> => {
  if (workspaces.length === 0) return [];
  const each = workspaces.map((workspace) => `${workspace.name} (exit ${workspace.exitCode})`);
  return [`test:budget: tests failed: ${each.join(', ')}.`];
};

const overBudget = (workspaces: ReadonlyArray<Workspace>): ReadonlyArray<string> => {
  if (workspaces.length === 0) return [];
  const each = workspaces.map((workspace) => `${workspace.name} ${seconds(workspace.ms)}`);
  return [
    `test:budget: over budget: ${each.join(', ')}.`,
    'A test that waits on real time, a setup each test repeats, or one long file a worker runs alone is the usual cause.',
    'Measure a workspace again, alone, with `bun run test:budget <workspace>`.',
  ];
};
