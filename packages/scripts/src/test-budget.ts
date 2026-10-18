#!/usr/bin/env bun
// `bun run test:budget [<workspace>…]`: the tests' time budget. Each
// workspace's `test` finishes in under 10 seconds wall on the owner's laptop,
// measured alone; there is no budget on the sum (owner, 2026-10-18: "should
// not ahve their tests and budgets entangled"). This runs each workspace's
// `test` by itself, one after another, as `turbo run test --filter=<name>`
// (never cached, so the build a workspace's `test` depends on runs first and
// is not timed), reads that workspace's `test` span from turbo's run summary,
// and fails when any one reaches the budget. Named workspaces are measured
// alone and the rest are left out; with none named, every workspace that
// `bun run test` runs is measured.
//
// Local only, like `test:perf`: CI's runners are smaller
// and shared, so a wall-clock budget there would fail on the runner, not on
// the code. In CI the guard is each test's own timeout: bun's 5 s, or the
// `--timeout` a workspace's `test` script names (`packages/film` also sets
// the same number in a preload, for effect-bun-test's runners).
//
// The load average before the first workspace runs and the core count are
// printed beside the times: read once, since each workspace's run lifts the
// average the next would read. A machine busier than its cores measures
// nothing: the run prints "not measured (load N on C cores)" and exits 0, so
// the merge step measures again on a quiet machine; at or below the core
// count, over budget fails (`test-budget/budget.ts`). A test that fails still
// fails, at any load.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Array as Arr, Clock, Console, Effect, FileSystem, Option, Path, Schema } from 'effect';
import { Argument, Command } from 'effect/cli';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import { availableParallelism, loadavg } from 'node:os';
import { judge } from './test-budget/budget.js';

/** What this reads of turbo's dry run (`--dry=json`): each task, and the command it would run. */
const DryRun = Schema.Struct({
  tasks: Schema.Array(
    Schema.Struct({ taskId: Schema.String, package: Schema.String, command: Schema.String }),
  ),
});

/** What this reads of turbo's run summary (`--summarize`): each task's span. */
const RunSummary = Schema.Struct({
  tasks: Schema.Array(
    Schema.Struct({
      taskId: Schema.String,
      execution: Schema.Struct({ startTime: Schema.Number, endTime: Schema.Number }),
    }),
  ),
});

/** A name given that no workspace's `test` answers to. */
class UnknownWorkspace extends Schema.TaggedError<UnknownWorkspace>()('UnknownWorkspace', {
  message: Schema.String,
}) {}

/** turbo's run summaries left after a run that did not write exactly one. */
class SummaryMissing extends Schema.TaggedError<SummaryMissing>()('SummaryMissing', {
  message: Schema.String,
}) {}

/** The workspaces `bun run test` runs a `test` in, by turbo's own dry run. */
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
        .map((task) => task.package)
        .toSorted(),
    ),
  );

/** Runs one workspace's `test` alone and answers its time and its exit code. */
const measure = (root: string, name: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner;
    const runs = path.join(root, '.turbo', 'runs');
    const summariesIn = Effect.map(
      Effect.orElseSucceed(fs.readDirectory(runs), (): ReadonlyArray<string> => []),
      (names) => new Set(names),
    );
    const before = yield* summariesIn;
    yield* Console.log(`\ntest:budget: ${name} alone`);
    const started = yield* Clock.currentTimeMillis;
    const exitCode = yield* Effect.scoped(
      Effect.flatMap(
        spawner.spawn(
          ChildProcess.make(
            'turbo',
            ['run', 'test', `--filter=${name}`, '--summarize', '--ui=stream'],
            {
              cwd: root,
              stdin: 'inherit',
              stdout: 'inherit',
              stderr: 'inherit',
              forceKillAfter: '5 seconds',
            },
          ),
        ),
        (child) => child.exitCode,
      ),
    );
    const wall = (yield* Clock.currentTimeMillis) - started;
    const written = [...(yield* summariesIn)].filter((file) => !before.has(file));
    const summaries = yield* Effect.forEach(written, (file) =>
      Effect.flatMap(
        fs.readFileString(path.join(runs, file)),
        Schema.decodeUnknownEffect(Schema.fromJsonString(RunSummary)),
      ),
    );
    yield* Effect.forEach(written, (file) => fs.remove(path.join(runs, file)));
    const span = Option.map(
      Arr.findFirst(
        summaries.flatMap((summary) => summary.tasks),
        (each) => each.taskId === `${name}#test`,
      ),
      (task) => task.execution.endTime - task.execution.startTime,
    );
    // A run that failed is named for its exit code, and timed by its wall when turbo wrote no span.
    if (exitCode !== 0)
      return { name, ms: Option.getOrElse(span, () => wall), exitCode: Number(exitCode) };
    if (written.length !== 1 || Option.isNone(span))
      return yield* new SummaryMissing({
        message: `test:budget: expected one run summary naming ${name}#test in ${runs}, found ${written.length}.`,
      });
    return { name, ms: span.value, exitCode: 0 };
  });

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
      const known = yield* workspacesOfTest(root);
      const unknown = names.filter((name) => !known.includes(name));
      if (unknown.length > 0)
        return yield* new UnknownWorkspace({
          message: `test:budget: no workspace's test is named ${unknown.join(', ')}; the workspaces are ${known.join(', ')}.`,
        });
      const chosen = Arr.match(names, {
        onEmpty: () => known,
        onNonEmpty: (given) => Arr.dedupe(given),
      });
      // The machine's load before the run: what else was running, not the run's own.
      const [load = 0] = loadavg();
      const workspaces = yield* Effect.forEach(chosen, (name) => measure(root, name));
      const judged = judge({ workspaces, load, cores: availableParallelism() });
      yield* Console.log(judged.report.join('\n'));
      if (judged.failure.length > 0) yield* Console.error(judged.failure.join('\n'));
      yield* Effect.sync(() => {
        process.exitCode = judged.code;
      });
    }).pipe(
      Effect.catchTag(['UnknownWorkspace', 'SummaryMissing'], (error) =>
        Effect.andThen(
          Console.error(error.message),
          Effect.sync(() => {
            process.exitCode = 1;
          }),
        ),
      ),
    ),
).pipe(Command.withDescription("Measure each workspace's tests alone against the 10 s budget"));

Command.run(command, { version: '1.0.0' }).pipe(
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
