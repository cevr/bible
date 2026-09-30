// CI's verdict on one commit: the gate workflow's run for it, as `gh` reports
// it, read into one line a ledger row can carry (the run id, the conclusion,
// and the jobs that failed).

import { Array as Arr, Option, Schema } from 'effect';

/** A gate run as `gh run list --json databaseId,status,conclusion,headSha,url` answers it. */
export const GateRun = Schema.Struct({
  databaseId: Schema.Finite,
  status: Schema.String,
  conclusion: Schema.String,
  headSha: Schema.String,
  url: Schema.String,
});
export type GateRun = typeof GateRun.Type;

/** A run's jobs as `gh run view --json jobs` answers them. */
export const GateJobs = Schema.Struct({
  jobs: Schema.Array(Schema.Struct({ name: Schema.String, conclusion: Schema.String })),
});
export type GateJobs = typeof GateJobs.Type;

/** Whether the run has finished, whatever its conclusion. */
export const finished = (run: GateRun): boolean => run.status === 'completed';

/** Whether the run passed: finished, and green. */
export const passed = (run: GateRun): boolean => finished(run) && run.conclusion === 'success';

/** The jobs that did not pass. */
export const failedJobs = (jobs: GateJobs): ReadonlyArray<string> =>
  jobs.jobs
    .filter((job) => job.conclusion !== 'success' && job.conclusion !== 'skipped')
    .map((job) => job.name);

/** The verdict as one line: `ci <conclusion> run=<id> sha=<short>`, the failed jobs when any, the URL. */
export const verdictLine = (run: GateRun, failed: ReadonlyArray<string>): string =>
  [
    `ci ${Option.getOrElse(
      Option.filter(Option.some(run.conclusion), (c) => c !== ''),
      () => run.status,
    )}`,
    `run=${run.databaseId}`,
    `sha=${run.headSha.slice(0, 8)}`,
    ...Arr.match(failed, {
      onEmpty: () => [],
      onNonEmpty: (names) => [`failed="${names.join(', ')}"`],
    }),
    run.url,
  ].join(' ');
