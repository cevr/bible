// The tests' time budget, judged: each workspace's `test`, run alone, under
// 10 seconds wall. There is no budget on the sum: the workspaces are separate
// projects, and one's verdict never depends on another's (owner, 2026-10-18:
// "should not ahve their tests and budgets entangled").
//
// Each workspace is read beside the machine's load average before its run. A
// machine busier than its cores (a load average above its core count) times
// the other work as much as the tests, so that workspace is not measured: the
// report says so and names it, and the merge step measures it again on a
// quiet machine. At or below the core count, a workspace over budget fails.
// A workspace whose tests fail fails the run at any load.

/** The budget, in milliseconds, for each workspace's `test`. */
const BUDGET_MS = 10_000;

/** One workspace's `test`, run alone: its time, the load before it, and its exit code. */
interface Workspace {
  readonly name: string;
  readonly ms: number;
  readonly load: number;
  readonly exitCode: number;
}

/** The workspaces as they were timed, one after another, on a machine with `cores` cores. */
interface Run {
  readonly workspaces: ReadonlyArray<Workspace>;
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
  const measured = (workspace: Workspace) => workspace.load <= run.cores;
  const unmeasured = workspaces.filter((workspace) => !measured(workspace));
  const failed = workspaces.filter((workspace) => workspace.exitCode !== 0);
  const over = workspaces.filter(
    (workspace) => measured(workspace) && workspace.exitCode === 0 && workspace.ms >= BUDGET_MS,
  );
  const line = (workspace: Workspace) => {
    const time = `  ${seconds(workspace.ms).padStart(7)}  ${workspace.name}`;
    const load = workspace.load.toFixed(1);
    if (measured(workspace)) return `${time}  (load ${load})`;
    return `${time}  not measured (load ${load} on ${run.cores} cores)`;
  };
  const report = [
    '',
    `test:budget: each workspace alone, under ${seconds(BUDGET_MS)} (on ${run.cores} cores)`,
    ...workspaces.map(line),
    ...notMeasured(unmeasured),
  ];
  const failure = [...testsFailed(failed), ...overBudget(over)];
  if (failure.length > 0) return { report, failure, code: 1 };
  return { report, failure, code: 0 };
};

const names = (workspaces: ReadonlyArray<Workspace>) =>
  workspaces.map((workspace) => workspace.name).join(', ');

const notMeasured = (workspaces: ReadonlyArray<Workspace>): ReadonlyArray<string> => {
  if (workspaces.length === 0) return [];
  if (workspaces.length === 1)
    return [
      `test:budget: not measured: ${names(workspaces)}; measure it again on a quiet machine.`,
    ];
  return [
    `test:budget: not measured: ${names(workspaces)}; measure them again on a quiet machine.`,
  ];
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
  ];
};
