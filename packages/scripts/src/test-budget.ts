#!/usr/bin/env bun
// `bun run test:budget`: the tests' time budget. Every workspace's `test`
// and the whole of `bun run test` finish in under 10 seconds on the owner's
// laptop with its dependencies installed. This runs `turbo run test` (never
// cached), times it, reads each workspace's time from turbo's run summary,
// and fails when the run or any one workspace reaches the budget.
//
// Local only, like `test:perf`: CI's runners are smaller
// and shared, so a wall-clock budget there would fail on the runner, not on
// the code. In CI the guard is each test's own timeout: bun's 5 s, or the
// `--timeout` a workspace's `test` script names.
//
// The load average before the run and the core count are printed beside the
// times. A machine busier than its cores measures nothing: the run prints
// "not measured (load N on C cores)" and exits 0, so the merge step measures
// again on a quiet machine; at or below the core count, over budget fails
// (`test-budget/budget.ts`). A test that fails still fails, at any load.

import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Clock, Console, Effect, FileSystem, Path, Schema } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import { availableParallelism, loadavg } from 'node:os';
import { judge } from './test-budget/budget.js';

/** What this reads of turbo's run summary (`--summarize`): each task's span. */
const RunSummary = Schema.Struct({
  tasks: Schema.Array(
    Schema.Struct({
      taskId: Schema.String,
      execution: Schema.Struct({ startTime: Schema.Number, endTime: Schema.Number }),
    }),
  ),
});

const run = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner;
  // packages/scripts/src → the repo root, and the folder turbo writes its summaries to.
  const root = path.resolve(import.meta.dir, '..', '..', '..');
  const runs = path.join(root, '.turbo', 'runs');
  const summariesIn = Effect.map(
    Effect.orElseSucceed(fs.readDirectory(runs), (): ReadonlyArray<string> => []),
    (names) => new Set(names),
  );
  const before = yield* summariesIn;
  // The machine's load before the run: what else was running, not the run's own.
  const [load = 0] = loadavg();
  const started = yield* Clock.currentTimeMillis;
  const child = yield* spawner.spawn(
    ChildProcess.make('turbo', ['run', 'test', '--summarize'], {
      cwd: root,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    }),
  );
  const exitCode = yield* child.exitCode;
  const wall = (yield* Clock.currentTimeMillis) - started;
  if (exitCode !== 0) return exitCode;
  const written = [...(yield* summariesIn)].filter((name) => !before.has(name));
  if (written.length !== 1) {
    yield* Console.error(
      `test:budget: expected one new run summary in ${runs}, found ${written.length}.`,
    );
    return 1;
  }
  const summaryPath = path.join(runs, written[0] ?? '');
  const summary = yield* Effect.flatMap(
    fs.readFileString(summaryPath),
    Schema.decodeUnknownEffect(Schema.fromJsonString(RunSummary)),
  );
  yield* fs.remove(summaryPath);
  const judged = judge({
    tasks: summary.tasks.map((task) => ({
      name: task.taskId,
      ms: task.execution.endTime - task.execution.startTime,
    })),
    wall,
    load,
    cores: availableParallelism(),
  });
  yield* Console.log(judged.report.join('\n'));
  if (judged.failure.length > 0) yield* Console.error(judged.failure.join('\n'));
  return judged.code;
}).pipe(
  Effect.flatMap((code) =>
    Effect.sync(() => {
      process.exitCode = code;
    }),
  ),
  Effect.scoped,
  Effect.provide(BunServices.layer),
);

BunRuntime.runMain(run);
