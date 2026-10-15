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
// A slow run on a busy machine says so: the load average before the run is
// printed beside the times, and a run over budget under load is run again
// when the machine is quiet.

import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Clock, Console, Effect, FileSystem, Path, Schema } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import { availableParallelism, loadavg } from 'node:os';

/** The budget, in milliseconds, for the whole run and for each workspace's `test`. */
const BUDGET_MS = 10_000;

/** What this reads of turbo's run summary (`--summarize`): each task's span. */
const RunSummary = Schema.Struct({
  tasks: Schema.Array(
    Schema.Struct({
      taskId: Schema.String,
      execution: Schema.Struct({ startTime: Schema.Number, endTime: Schema.Number }),
    }),
  ),
});

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

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
  const tasks = summary.tasks
    .map((task) => ({
      name: task.taskId,
      ms: task.execution.endTime - task.execution.startTime,
    }))
    .toSorted((a, b) => b.ms - a.ms);
  const over = [...tasks, { name: 'bun run test', ms: wall }].filter(
    (task) => task.ms >= BUDGET_MS,
  );
  yield* Console.log(
    [
      '',
      `test:budget: under ${seconds(BUDGET_MS)} each (load average ${load.toFixed(1)} before it, on ${availableParallelism()} cores)`,
      ...tasks.map((task) => `  ${seconds(task.ms).padStart(7)}  ${task.name}`),
      `  ${seconds(wall).padStart(7)}  bun run test`,
    ].join('\n'),
  );
  if (over.length === 0) return 0;
  yield* Console.error(
    `test:budget: over budget: ${over.map((task) => `${task.name} ${seconds(task.ms)}`).join(', ')}.\n` +
      'A test that waits on real time, a setup each test repeats, or one long file a worker runs alone is the usual cause;\n' +
      'on a busy machine (a load average above its cores), run it again when the machine is quiet.',
  );
  return 1;
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
