#!/usr/bin/env bun
// CI's verdict on a commit pushed to main: finds the gate workflow's run for
// it, waits until it finishes, and prints one line with the run id, the
// conclusion and the jobs that failed, each with the step it stopped in and
// how long that step ran (a cancelled job also its own time and the step that
// spent most of it). Exits non-zero unless the run passed,
// so the loop records a red run as a finding with its id, not a re-run.
//
//   bun run ci                          # the checkout's HEAD
//   bun run ci <commit>                 # another commit on main (short sha or ref)
//   bun run ci <base>..<head>           # each first-parent commit after base up to head, oldest first
//   bun run ci <base>..<head> --ledger  # and exit non-zero if the ledger lacks a line
//
// A range prints one line per commit (a merge and its ledger commit, or a
// whole pass) and exits non-zero if any run is not green. Only the head is
// waited for to appear: an earlier commit with no run of its own was pushed
// inside a later push, and prints `ci none`.
//
// Then each commit whose line the loop's ledgers
// (apps/animations/plans/architecture-loop-*.md) lack prints
// `ledger missing sha=<short>` on stderr. With `--ledger` a missing line
// fails the run: the loop's merge and live-check steps run it so, after
// pasting the lines.
//
// A red job's log: `gh run view <run> --log-failed`.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, FileSystem, Option, Path, Runtime, Schedule, Schema } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import {
  GateJobs,
  GateRun,
  failedJobs,
  finished,
  missingLine,
  noRunLine,
  passed,
  type Target,
  targetOf,
  unrecorded,
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

class LedgerMissing extends Schema.TaggedError<LedgerMissing>()('LedgerMissing', {
  count: Schema.Finite,
}) {
  override get message() {
    return `${this.count} commit(s) have no ci line on the ledger (apps/animations/plans/architecture-loop-*.md)`;
  }
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

/** The full shas of the commits `target` names, oldest first. */
const commitsOf = (target: Target) => {
  if (target._tag === 'Commit') return Effect.map(shaOf(target.ref), (sha) => [sha]);
  return commitsIn(target.base, target.head);
};

/** Every loop ledger's text, joined: a pass's commits can cross into the next ledger. */
const ledgers = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = (yield* run('git', ['rev-parse', '--show-toplevel'])).trim();
  const plans = path.join(root, 'apps', 'animations', 'plans');
  const names = (yield* fs.readDirectory(plans)).filter((name) =>
    /^architecture-loop-.*\.md$/.test(name),
  );
  const texts = yield* Effect.forEach(names, (name) => fs.readFileString(path.join(plans, name)));
  return texts.join('\n');
});

const verdict = Command.make(
  'ci',
  {
    commit: Argument.String('commit').pipe(Argument.optional),
    ledger: Flag.Boolean('ledger').pipe(
      Flag.withDefault(false),
      Flag.withDescription("exit non-zero when the loop's ledger lacks a commit's ci line"),
    ),
  },
  ({ commit, ledger }) =>
    Effect.gen(function* () {
      const commits = yield* commitsOf(targetOf(Option.getOrElse(commit, () => 'HEAD')));
      const green = (yield* verdictsOn(commits)).every(Boolean);
      const missing = unrecorded(yield* ledgers, commits);
      yield* Effect.forEach(missing, (sha) => Console.error(missingLine(sha)));
      if (!green) return yield* RunRed.make({});
      if (ledger && missing.length > 0) return yield* LedgerMissing.make({ count: missing.length });
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
