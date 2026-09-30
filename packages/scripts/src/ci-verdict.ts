#!/usr/bin/env bun
// CI's verdict on a commit pushed to main: finds the gate workflow's run for
// it, waits until it finishes, and prints one line with the run id, the
// conclusion and the jobs that failed. Exits non-zero unless the run passed,
// so the loop records a red run as a finding with its id, not a re-run.
//
//   bun run ci              # the checkout's HEAD
//   bun run ci <commit>     # another commit on main (short sha or ref)
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
  passed,
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

const verdict = Command.make(
  'ci',
  { commit: Argument.String('commit').pipe(Argument.optional) },
  ({ commit }) =>
    Effect.gen(function* () {
      // gh matches a run by the full sha, so a short one or a ref resolves first.
      const sha = yield* run('git', [
        'rev-parse',
        '--verify',
        `${Option.getOrElse(commit, () => 'HEAD')}^{commit}`,
      ]).pipe(Effect.map((s) => s.trim()));
      // A push takes a moment to start its run; a run takes minutes to finish.
      const gate = yield* runOf(sha).pipe(
        Effect.retry({ while: (e) => e._tag === 'RunNotFound', schedule: POLL, times: APPEAR }),
        Effect.repeat({ until: finished, schedule: POLL, times: FINISH }),
      );
      if (passed(gate)) return yield* Console.log(verdictLine(gate, []));
      yield* Console.log(verdictLine(gate, failedJobs(yield* jobsOf(gate))));
      return yield* RunRed.make({});
    }),
).pipe(Command.withDescription("Wait for CI's gate run on a commit on main and print its verdict"));

Command.run(verdict, { version: '1.0.0' }).pipe(
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
