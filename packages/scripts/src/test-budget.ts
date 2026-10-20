#!/usr/bin/env bun
// `bun run test:budget [<workspace>…]`: the tests' time budget. Each
// workspace's `test` finishes in under 10 seconds wall on the owner's laptop,
// measured alone; there is no budget on the sum (owner, 2026-10-18: "should
// not ahve their tests and budgets entangled"). This runs each workspace's
// `test` by itself, one after another, as `turbo run test --filter=<name>`
// (the `test` task is never cached; a build it depends on runs, or replays
// from turbo's cache, first and outside its span), reads that workspace's
// `test` span from turbo's run summary, and fails when any one reaches the
// budget. Named workspaces are measured alone and the rest are left out; with
// none named, every workspace that `bun run test` runs is measured.
//
// A run reads only the summary its own turbo names on its `Summary:` line,
// and removes only that file: another run's summary in the same
// `.turbo/runs` is never read or removed. When turbo names no summary, more
// than one, one outside `.turbo/runs`, or one that does not decode or names no
// `<ws>#test`, the workspace has no time, at any exit code: nothing is
// measured or removed, its line names its exit code and no time, and the run
// fails.
//
// Local only, like `test:perf`: CI's runners are smaller and shared, so a
// wall-clock budget there would fail on the runner, not on the code. In CI
// the guard is each test's timeout: bun's 5 s, which no workspace's `test`
// script raises (`test-budget/strength.ts`, held over every workspace by its
// test) and no test raises but a spawn budget
// (`film/tests-keep-their-strength`). A workspace whose `test` script weakens
// its tests is not measured: the run names each flag and fails. Neither is
// one with a test file no script of it runs (`test-budget/reach.ts`): the run
// names each file and fails.
//
// The 1- and 5-minute load averages before the first workspace runs and the
// core count are printed beside the times: read once, since each workspace's
// run lifts the averages the next would read. A machine busier than its cores
// by either average measures nothing (the 5-minute one keeps a lull of a
// minute in a busy period from admitting the run): the run prints "not
// measured (load average N over 1 min and M over 5 min, on C cores)" as its
// last line, and nothing measures it again. At or below the core count, a
// workspace at or over the budget fails. The verdict and its exit code are the
// judge's (`test-budget/budget.ts`, its header).

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import {
  Array as Arr,
  Console,
  Effect,
  FileSystem,
  Option,
  Path,
  Result,
  Schema,
  Stream,
} from 'effect';
import { Argument, Command } from 'effect/cli';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import { availableParallelism, loadavg } from 'node:os';
import { judge } from './test-budget/budget.js';
import { reachesIn, repoTests } from './test-budget/reach.js';
import { weakeningFlags } from './test-budget/strength.js';

/** What this reads of turbo's dry run (`--dry=json`): each task, and the command it would run. */
const DryRun = Schema.Struct({
  tasks: Schema.Array(
    Schema.Struct({
      taskId: Schema.String,
      package: Schema.String,
      directory: Schema.String,
      command: Schema.String,
    }),
  ),
});

/** What this reads of turbo's run summary (`--summarize`): each task's span. */
const RunSummary = Schema.Struct({
  tasks: Schema.Array(
    Schema.Struct({
      taskId: Schema.String,
      execution: Schema.Struct({ startTime: Schema.Finite, endTime: Schema.Finite }),
    }),
  ),
});

/** A name given that no workspace's `test` answers to. */
class UnknownWorkspace extends Schema.TaggedError<UnknownWorkspace>()('UnknownWorkspace', {
  message: Schema.String,
}) {}

/** A workspace whose `test` script weakens its tests: its time would not be its tests' at full strength. */
class WeakenedTests extends Schema.TaggedError<WeakenedTests>()('WeakenedTests', {
  message: Schema.String,
}) {}

/** A workspace with a test file no script of it runs: its time would leave that file out. */
class UnreachedTests extends Schema.TaggedError<UnreachedTests>()('UnreachedTests', {
  message: Schema.String,
}) {}

/** A run whose own turbo left no summary this can read: no path printed, or a file that does not decode or names no `<ws>#test`. */
class SummaryUnreadable extends Schema.TaggedError<SummaryUnreadable>()('SummaryUnreadable', {
  message: Schema.String,
}) {}

/** turbo's line naming the summary it wrote: `Summary:    <root>/.turbo/runs/<id>.json`. */
const SUMMARY_LINE = /^Summary:\s+(\S.*\.json)\s*$/;

/** The workspaces `bun run test` runs a `test` in, by turbo's own dry run: each name and the command its `test` runs. */
const workspacesOfTest = (root: string) =>
  Effect.flatMap(ChildProcessSpawner, (spawner) =>
    spawner.string(
      ChildProcess.make('turbo', ['run', 'test', '--dry=json'], {
        cwd: root,
        forceKillAfter: '5 seconds',
      }),
    ),
  ).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(DryRun))),
    Effect.map((dry) =>
      dry.tasks
        .filter(
          (task) => task.taskId === `${task.package}#test` && task.command !== '<NONEXISTENT>',
        )
        .map((task) => ({ name: task.package, directory: task.directory, command: task.command }))
        .toSorted((a, b) => a.name.localeCompare(b.name)),
    ),
  );

/**
 * This run's own summary, by the path its own turbo printed: the file, and the
 * span of `<name>#test` in it. Nothing else in `.turbo/runs` is read, so a
 * summary another writer left there (a second budget run, a hand-run turbo)
 * is never taken for this one.
 */
const ownSummary = (runs: string, name: string, printed: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const unreadable = (why: string) =>
      SummaryUnreadable.make({
        message: `test:budget: ${name}: ${why}; nothing is measured or removed.`,
      });
    const only = Arr.head(printed);
    if (Option.isNone(only) || printed.length > 1)
      return yield* unreadable(`turbo printed ${printed.length} summary paths, not one`);
    const file = only.value;
    const inRuns = yield* Effect.all([fs.realPath(path.dirname(file)), fs.realPath(runs)]).pipe(
      Effect.map(([dir, expected]) => dir === expected),
      Effect.orElseSucceed(() => false),
    );
    if (!inRuns) return yield* unreadable(`turbo's summary ${file} is not in ${runs}`);
    const summary = yield* fs.readFileString(file).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(RunSummary))),
      Effect.mapError((error) =>
        unreadable(`turbo's summary ${file} does not read: ${error.message}`),
      ),
    );
    const task = Arr.findFirst(summary.tasks, (each) => each.taskId === `${name}#test`);
    if (Option.isNone(task))
      return yield* unreadable(`turbo's summary ${file} names no ${name}#test`);
    return { file, ms: task.value.execution.endTime - task.value.execution.startTime };
  });

/** Runs one workspace's `test` alone and answers its time and its exit code. */
const measure = (root: string, name: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner;
    yield* Console.log(`\ntest:budget: ${name} alone`);
    // turbo's output is passed on line by line, and its `Summary:` line kept:
    // the path of the one summary this run wrote.
    const [exitCode, printed] = yield* Effect.scoped(
      Effect.flatMap(
        spawner.spawn(
          ChildProcess.make(
            'turbo',
            ['run', 'test', `--filter=${name}`, '--summarize', '--ui=stream', '--no-color'],
            {
              cwd: root,
              stdin: 'inherit',
              stderr: 'inherit',
              forceKillAfter: '5 seconds',
            },
          ),
        ),
        (child) =>
          Effect.all(
            [
              child.exitCode,
              child.stdout.pipe(
                Stream.decodeText,
                Stream.splitLines,
                Stream.tap((line) => Console.log(line)),
                Stream.filter((line) => SUMMARY_LINE.test(line)),
                Stream.map((line) => line.replace(SUMMARY_LINE, '$1')),
                Stream.runCollect,
              ),
            ],
            { concurrency: 2 },
          ),
      ),
    );
    const own = yield* Effect.result(ownSummary(path.join(root, '.turbo', 'runs'), name, printed));
    // Only the summary this run read is removed; `force` lets one another hand removed first pass.
    if (Result.isSuccess(own)) yield* fs.remove(own.success.file, { force: true });
    // At any exit, a workspace whose own summary did not read has no time: the judge names its exit and fails the run.
    if (Result.isFailure(own)) yield* Console.error(own.failure.message);
    return {
      name,
      ms: Result.match(own, {
        onSuccess: (summary) => Option.some(summary.ms),
        onFailure: () => Option.none<number>(),
      }),
      exitCode: Number(exitCode),
    };
  });

/** A refusal: its words on stderr, and the run fails. */
const refuse = (message: string) =>
  Effect.andThen(
    Console.error(message),
    Effect.sync(() => {
      process.exitCode = 1;
    }),
  );

const command = Command.make(
  'test-budget',
  {
    names: Argument.String('workspace').pipe(
      Argument.variadic(),
      Argument.withDescription(
        'the workspaces to measure, by package name (default: every workspace `bun run test` runs)',
      ),
    ),
  },
  ({ names }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      // packages/scripts/src → the repo root.
      const root = path.resolve(import.meta.dir, '..', '..', '..');
      const tests = yield* workspacesOfTest(root);
      const known = tests.map((test) => test.name);
      const unknown = names.filter((name) => !known.includes(name));
      if (unknown.length > 0)
        return yield* UnknownWorkspace.make({
          message: `test:budget: no workspace's test is named ${unknown.join(', ')}; the workspaces are ${known.join(', ')}.`,
        });
      const chosen = Arr.match(names, {
        onEmpty: () => known,
        onNonEmpty: (given) => Arr.dedupe(given),
      });
      // A weakened suite fits the budget by running less, so none is measured.
      const weakened = tests
        .filter((test) => chosen.includes(test.name))
        .flatMap((test) => weakeningFlags(test.command).map((why) => `${test.name}: ${why}`));
      if (weakened.length > 0)
        return yield* WeakenedTests.make({
          message: `test:budget: nothing is measured; a workspace's test script weakens its tests:\n${weakened.join('\n')}`,
        });
      // A suite that leaves a test file out fits the budget by running less, so none is measured.
      const dirs = tests.filter((test) => chosen.includes(test.name)).map((test) => test.directory);
      const { workspaces: all, tests: sources } = yield* repoTests(root);
      const unreached = reachesIn(all, sources)
        .filter(
          ({ file, by }) => Option.isNone(by) && dirs.some((dir) => file.startsWith(`${dir}/`)),
        )
        .map(({ file }) => file);
      if (unreached.length > 0)
        return yield* UnreachedTests.make({
          message: `test:budget: nothing is measured; no script of its workspace runs these test files:\n${unreached.join('\n')}`,
        });
      // The machine's load before the run: what else was running, not the run's own.
      const [one = 0, five = 0] = loadavg();
      const workspaces = yield* Effect.forEach(chosen, (name) => measure(root, name));
      const judged = judge({ workspaces, load: { one, five }, cores: availableParallelism() });
      yield* Console.log(judged.report.join('\n'));
      if (judged.failure.length > 0) yield* Console.error(judged.failure.join('\n'));
      yield* Effect.sync(() => {
        process.exitCode = judged.code;
      });
    }).pipe(
      Effect.catchTags({
        UnknownWorkspace: (error) => refuse(error.message),
        WeakenedTests: (error) => refuse(error.message),
        UnreachedTests: (error) => refuse(error.message),
      }),
    ),
).pipe(Command.withDescription("Measure each workspace's tests alone against the 10 s budget"));

Command.run(command, { version: '1.0.0' }).pipe(
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
