#!/usr/bin/env bun
// CI guard: every file a workspace's typecheck reads is hashed by turbo, so a
// change to it cannot be served from turbo's cache without tsc running. For
// each `typecheck` task in turbo's dry run, tsc lists the files its program
// reads (`--listFilesOnly`: the tsconfig's include and everything it imports);
// each tracked one must be among the inputs of that task or of a task it
// depends on. Run from anywhere in the repo: `bun packages/scripts/src/typecheck-inputs.ts`.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, Path, Runtime, Schema } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import { type TypecheckTask, unhashed } from './typecheck-inputs/unhashed.js';

class InputsMissing extends Schema.TaggedError<InputsMissing>()('InputsMissing', {
  files: Schema.Finite,
}) {
  override readonly [Runtime.errorReported] = false;
}

const DryRun = Schema.fromJsonString(
  Schema.Struct({
    tasks: Schema.Array(
      Schema.Struct({
        taskId: Schema.String,
        task: Schema.String,
        directory: Schema.String,
        dependencies: Schema.Array(Schema.String),
        inputs: Schema.Record(Schema.String, Schema.String),
      }),
    ),
  }),
);

const lines = (text: string): ReadonlyArray<string> =>
  text.split('\n').filter((line) => line.trim() !== '');

const check = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner;
  const path = yield* Path.Path;
  const root = (yield* spawner.string(
    ChildProcess.make('git', ['rev-parse', '--show-toplevel']),
  )).trim();
  const bin = (name: string) => path.join(root, 'node_modules', '.bin', name);
  const tracked = new Set(
    lines(yield* spawner.string(ChildProcess.make('git', ['ls-files'], { cwd: root }))),
  );
  const dry = yield* Schema.decodeEffect(DryRun)(
    yield* spawner.string(
      ChildProcess.make(bin('turbo'), ['run', 'typecheck', '--dry=json'], { cwd: root }),
    ),
  );
  const typechecks = dry.tasks.filter((t) => t.task === 'typecheck');
  const tasks = new Map<string, TypecheckTask>(
    typechecks.map((t) => [
      t.taskId,
      {
        taskId: t.taskId,
        dependencies: t.dependencies,
        inputs: new Set(Object.keys(t.inputs).map((file) => path.join(t.directory, file))),
      },
    ]),
  );
  const gaps = yield* Effect.forEach(
    typechecks,
    Effect.fnUntraced(function* (t) {
      const listed = yield* spawner.string(
        ChildProcess.make(bin('tsc'), ['-p', t.directory, '--listFilesOnly'], { cwd: root }),
      );
      const program = lines(listed)
        .map((file) => path.relative(root, file))
        .filter((file) => tracked.has(file));
      const missed = unhashed(t.taskId, program, tasks);
      for (const file of missed)
        yield* Console.error(`${t.taskId} reads ${file}, not in its inputs`);
      return missed.length;
    }),
    { concurrency: 4 },
  );
  const files = gaps.reduce((a, b) => a + b, 0);
  yield* Console.log(`typecheck-inputs tasks=${typechecks.length} unhashed=${files}`);
  if (files > 0) return yield* InputsMissing.make({ files });
});

check.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
