#!/usr/bin/env bun
// CI's verdict on a commit pushed to main: finds the gate workflow's run for
// it, waits until it finishes, and prints one line with the run id, the
// conclusion and the jobs that failed, each with the step it stopped in and
// how long that step ran. Exits non-zero unless the run passed,
// so the loop records a red run as a finding with its id, not a re-run.
//
//   bun run ci                 # the checkout's HEAD
//   bun run ci <commit>        # another commit on main (short sha or ref)
//   bun run ci <base>..<head>  # each first-parent commit after base up to head, oldest first
//
// A range prints one line per commit (a merge and its ledger commit, or a
// whole pass) and exits non-zero if any run is not green. Only the head is
// waited for to appear: an earlier commit with no run of its own was pushed
// inside a later push, and prints `ci none`.
//
// A red job's log: `gh run view <run> --log-failed`.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, Option, Runtime, Schedule, Schema } from 'effect';
import { Argument, Command } from 'effect/cli';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import {
  GateJobs,
  GateRun,
  failedJobs,
  finished,
  noRunLine,
  passed,
  type Target,
  targetOf,
  verdictLine,
} from './ci-verdict/verdict.js';

class RunNotFound extends Schema.TaggedError<RunNotFound>()('RunNotFound', {
  sha: Schema.String,
}) {
  override get message() {
    return `no gate run on main for ${this.sha} yet: is it pushed? (gh run list --branch main)`;
  }
}

class RunRed extends Schema.TaggedError<RunRed>()('RunRed', {}) {
  override readonly [Runtime.errorReported] = false;
}

/** How often, and how long, the run is looked for and waited on. */
const POLL = Schedule.spaced('20 seconds');
const APPEAR = 10;
const FINISH = 150;

const run = (command: string, args: ReadonlyArray<string>) =>
  Effect.flatMap(ChildProcessSpawner, (spawner) =>
    spawner.string(ChildProcess.make(command, args)),
  );

const gh = (args: ReadonlyArray<string>) => run('gh', args);

/** The gate run for `sha` on main, as it stands now. */
const runOf = (sha: string) =>
  gh([
    'run',
    'list',
    '--workflow',
    'gate.yml',
    '--branch',
    'main',
    '--commit',
    sha,
    '--limit',
    '1',
    '--json',
    'databaseId,status,conclusion,headSha,url',
  ]).pipe(
    Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(Schema.Array(GateRun)))),
    Effect.flatMap((runs) => Effect.fromOption(Option.fromUndefinedOr(runs[0]))),
    Effect.catchTag('NoSuchElementError', () => Effect.fail(RunNotFound.make({ sha }))),
  );

const jobsOf = (run: GateRun) =>
  gh(['run', 'view', String(run.databaseId), '--json', 'jobs']).pipe(
    Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(GateJobs))),
  );

/** A commit's full sha: gh matches a run by it, so a short one or a ref resolves first. */
const shaOf = (ref: string) =>
  run('git', ['rev-parse', '--verify', `${ref}^{commit}`]).pipe(Effect.map((s) => s.trim()));

/** The first-parent commits after `base` up to `head`, oldest first: main's own history. */
const commitsIn = (base: string, head: string) =>
  run('git', ['rev-list', '--first-parent', '--reverse', `${base}..${head}`]).pipe(
    Effect.map((out) => out.split('\n').filter((line) => line !== '')),
  );

/**
 * Print the verdict on `sha`'s run once it has finished, and answer whether it
 * passed. `appear` is how many polls a run not there yet is looked for: a
 * push takes a moment to start its run, and a run takes minutes to finish.
 */
const verdictOn = (sha: string, appear: number) =>
  Effect.gen(function* () {
    const gate = yield* runOf(sha).pipe(
      Effect.retry({ while: (e) => e._tag === 'RunNotFound', schedule: POLL, times: appear }),
      Effect.repeat({ until: finished, schedule: POLL, times: FINISH }),
    );
    if (passed(gate)) return yield* Effect.as(Console.log(verdictLine(gate, [])), true);
    yield* Console.log(verdictLine(gate, failedJobs(yield* jobsOf(gate))));
    return false;
  });

/** Each commit's verdict in order; one with no run of its own (not the head) prints `ci none`. */
const verdictsOn = (commits: ReadonlyArray<string>) =>
  Effect.forEach(commits, (sha, i) => {
    if (i === commits.length - 1) return verdictOn(sha, APPEAR);
    return verdictOn(sha, 0).pipe(
      Effect.catchTag('RunNotFound', () => Effect.as(Console.log(noRunLine(sha)), true)),
    );
  });

/** Whether the run on each commit `target` names passed, each verdict printed. */
const verdictsFor = (target: Target) => {
  if (target._tag === 'Commit')
    return Effect.flatMap(shaOf(target.ref), (sha) => verdictOn(sha, APPEAR));
  return Effect.flatMap(commitsIn(target.base, target.head), verdictsOn).pipe(
    Effect.map((each) => each.every(Boolean)),
  );
};

const verdict = Command.make(
  'ci',
  { commit: Argument.String('commit').pipe(Argument.optional) },
  ({ commit }) =>
    Effect.gen(function* () {
      const green = yield* verdictsFor(targetOf(Option.getOrElse(commit, () => 'HEAD')));
      if (!green) return yield* RunRed.make({});
    }),
).pipe(
  Command.withDescription(
    "Wait for CI's gate run on a commit on main, or on each commit of a range, and print its verdict",
  ),
);

Command.run(verdict, { version: '1.0.0' }).pipe(
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
