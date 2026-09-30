// CI's verdict on one commit: the gate workflow's run for it, as `gh` reports
// it, read into one line a ledger row can carry (the run id, the conclusion,
// and the jobs that failed, each with the step it stopped in and how long that
// step ran, so a job cancelled by its time limit inside an install names the
// install).

import { Array as Arr, DateTime, Duration, Option, Schema } from 'effect';

/** A gate run as `gh run list --json databaseId,status,conclusion,headSha,url` answers it. */
export const GateRun = Schema.Struct({
  databaseId: Schema.Finite,
  status: Schema.String,
  conclusion: Schema.String,
  headSha: Schema.String,
  url: Schema.String,
});
export type GateRun = typeof GateRun.Type;

/** A job's step as `gh run view --json jobs` answers it. */
const GateStep = Schema.Struct({
  name: Schema.String,
  conclusion: Schema.String,
  startedAt: Schema.String,
  completedAt: Schema.String,
});
type GateStep = typeof GateStep.Type;

/** A run's jobs as `gh run view --json jobs` answers them. */
export const GateJobs = Schema.Struct({
  jobs: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      conclusion: Schema.String,
      steps: Schema.Array(GateStep),
    }),
  ),
});
export type GateJobs = typeof GateJobs.Type;

/** Whether the run has finished, whatever its conclusion. */
export const finished = (run: GateRun): boolean => run.status === 'completed';

/** Whether the run passed: finished, and green. */
export const passed = (run: GateRun): boolean => finished(run) && run.conclusion === 'success';

const green = (conclusion: string) => conclusion === 'success' || conclusion === 'skipped';

/** The whole seconds a step ran, when both its times read. */
const secondsOf = (step: GateStep): Option.Option<number> =>
  Option.map(
    Option.all([DateTime.make(step.startedAt), DateTime.make(step.completedAt)]),
    ([start, end]) => Math.round(Duration.toSeconds(DateTime.distance(start, end))),
  );

/** `Install ffmpeg: cancelled after 1016 s`: the step a job stopped in. */
const stoppedIn = (step: GateStep): string =>
  `${step.name}: ${step.conclusion}${Option.match(secondsOf(step), {
    onNone: () => '',
    onSome: (s) => ` after ${s} s`,
  })}`;

/** The jobs that did not pass, each with the first step that did not, when one did not. */
export const failedJobs = (jobs: GateJobs): ReadonlyArray<string> =>
  jobs.jobs
    .filter((job) => !green(job.conclusion))
    .map((job) =>
      Option.match(Option.fromUndefinedOr(job.steps.find((s) => !green(s.conclusion))), {
        onNone: () => job.name,
        onSome: (step) => `${job.name} in ${stoppedIn(step)}`,
      }),
    );

/** What `bun run ci` was asked about: one commit, or the first-parent commits of `base..head`. */
export type Target =
  | { readonly _tag: 'Commit'; readonly ref: string }
  | { readonly _tag: 'Range'; readonly base: string; readonly head: string };

/** `a..b` is a range (an empty side is HEAD, as git reads it); anything else one commit. */
export const targetOf = (arg: string): Target => {
  const at = arg.indexOf('..');
  if (at < 0) return { _tag: 'Commit', ref: arg };
  const side = (ref: string) =>
    Option.getOrElse(
      Option.liftPredicate(ref, (r) => r !== ''),
      () => 'HEAD',
    );
  return { _tag: 'Range', base: side(arg.slice(0, at)), head: side(arg.slice(at + 2)) };
};

/** A commit in a range with no gate run of its own: it was pushed inside a later push. */
export const noRunLine = (sha: string): string =>
  `ci none sha=${sha.slice(0, 8)} (no run of its own: pushed inside a later push)`;

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
