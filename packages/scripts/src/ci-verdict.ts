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
//   bun run ci --ledger                 # each commit the ledgers lack, since the first they record
//
// A range prints one line per commit (a merge and its ledger commit, or a
// whole pass) and exits non-zero if any run is not green. Only the head is
// waited for to appear: an earlier commit with no run of its own was pushed
// inside a later push, and prints `ci none`.
//
// Then each commit whose line the loop's ledgers
// (apps/animations/plans/architecture-loop-*.md) lack prints
// `ledger missing sha=<short>` on stderr, except a last commit that changes
// only those ledgers (the one that pastes the lines, or a triage): no ledger
// can hold its line before its run exists, so it prints
// `ledger pending sha=<short>` and the next record carries it.
// With `--ledger` a missing line fails the run. With no commit, `--ledger`
// reads every first-parent commit after the oldest one the ledgers record up
// to HEAD, and prints a verdict for each one they lack, so a commit left out
// behind a recorded one is still named: the loop runs this form after each
// push and at the live check, after pasting the lines.
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
  ledgerAccount,
  missingLine,
  noRunLine,
  passed,
  pendingLine,
  sinceRecording,
  type Target,
  targetOf,
  verdictLine,
} from './ci-verdict/verdict.js';

// Each refusal below prints its message alone (the command's `tapError`), not a
// stack of Effect internals under it.

class RunNotFound extends Schema.TaggedError<RunNotFound>()('RunNotFound', {
  sha: Schema.String,
}) {
  override get message() {
    return `no gate run on main for ${this.sha} yet: is it pushed? (gh run list --branch main)`;
  }
  override readonly [Runtime.errorReported] = false;
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
  override readonly [Runtime.errorReported] = false;
}

class NothingRecorded extends Schema.TaggedError<NothingRecorded>()('NothingRecorded', {}) {
  override get message() {
    return 'no ledger records a ci line on this history yet: give the range, bun run ci <base>..<head> --ledger';
  }
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

/**
 * Each commit's verdict in order. `head`, the commit just pushed, is waited
 * for to appear; any other with no run of its own prints `ci none`.
 */
const verdictsOn = (commits: ReadonlyArray<string>, head: string) =>
  Effect.forEach(commits, (sha) => {
    if (sha === head) return verdictOn(sha, APPEAR);
    return verdictOn(sha, 0).pipe(
      Effect.catchTag('RunNotFound', () => Effect.as(Console.log(noRunLine(sha)), true)),
    );
  });

/** The full shas of the commits `target` names, oldest first. */
const commitsOf = (target: Target) => {
  if (target._tag === 'Commit') return Effect.map(shaOf(target.ref), (sha) => [sha]);
  return commitsIn(target.base, target.head);
};

/** HEAD's first-parent history, newest first. */
const history = run('git', ['rev-list', '--first-parent', 'HEAD']).pipe(
  Effect.map((out) => out.split('\n').filter((line) => line !== '')),
);

/** The commits the ledgers lack after the oldest one they record, up to HEAD, oldest first. */
const unrecordedSince = (ledger: string) =>
  Effect.flatMap(history, (shas) =>
    Effect.fromOption(sinceRecording(ledger, shas)).pipe(
      Effect.mapError(() => NothingRecorded.make({})),
    ),
  );

/** The paths a commit changes over its first parent. */
const pathsOf = (sha: string) =>
  run('git', ['diff', '--name-only', `${sha}^1`, sha]).pipe(
    Effect.map((out) => out.split('\n').filter((line) => line !== '')),
  );

/**
 * The commits asked about, oldest first, and the head among them that is
 * waited for: a range's last commit, or with no commit and `--ledger`, HEAD.
 */
const asked = (ledger: string, commit: Option.Option<string>, ledgerFlag: boolean) =>
  Effect.gen(function* () {
    if (Option.isNone(commit) && ledgerFlag)
      return { commits: yield* unrecordedSince(ledger), head: yield* shaOf('HEAD') };
    const commits = yield* commitsOf(targetOf(Option.getOrElse(commit, () => 'HEAD')));
    return { commits, head: commits.at(-1) ?? '' };
  });

/** Print what the ledgers lack among `commits`, and answer it. */
const accountOf = (ledger: string, commits: ReadonlyArray<string>, head: string) =>
  Effect.gen(function* () {
    const headPaths = yield* Effect.when(pathsOf(head), Effect.succeed(commits.at(-1) === head));
    const account = ledgerAccount(
      ledger,
      commits,
      Option.getOrElse(headPaths, () => []),
    );
    yield* Effect.forEach(account.missing, (sha) => Console.error(missingLine(sha)));
    yield* Effect.forEach(Option.toArray(account.pending), (sha) =>
      Console.error(pendingLine(sha)),
    );
    return account;
  });

/** The refusals that print their message alone. */
const REFUSALS: ReadonlySet<string> = new Set(['RunNotFound', 'LedgerMissing', 'NothingRecorded']);

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
      const text = yield* ledgers;
      const { commits, head } = yield* asked(text, commit, ledger);
      const green = (yield* verdictsOn(commits, head)).every(Boolean);
      const account = yield* accountOf(text, commits, head);
      if (!green) return yield* RunRed.make({});
      if (ledger && account.missing.length > 0)
        return yield* LedgerMissing.make({ count: account.missing.length });
    }).pipe(
      Effect.tapError((error) => {
        if (!REFUSALS.has(error._tag)) return Effect.void;
        return Console.error(error.message);
      }),
    ),
).pipe(
  Command.withDescription(
    "Wait for CI's gate run on a commit on main, or on each commit of a range, and print its verdict",
  ),
);

Command.run(verdict, { version: '1.0.0' }).pipe(
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
