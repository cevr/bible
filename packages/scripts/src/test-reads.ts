#!/usr/bin/env bun
// `bun run test:reads`: every file a workspace's unit tests read is a file its
// cached `test` task hashes. turbo replays a cached pass while the files a task
// hashes are unchanged, so a test that reads a file its task does not hash (a
// skill page, a root file, another workspace's data) passes from the cache
// after that file changes in a way that would fail it.
//
// This runs each workspace's `test`, the ones `bun run test` runs, one after
// another, under a preload that records each path the tests open to read
// (`test-reads/preload.ts`), then holds the reads to the files turbo's dry run
// says the task hashes, its dependencies' `transit` tasks included
// (`test-reads/unhashed.ts`). It prints each workspace's count and each file
// read and not hashed, and fails on any such file, or on a `test` that does
// not pass (its reads would be partial). The fix is the file in the
// workspace's `turbo.json` `test` inputs (`$TURBO_ROOT$/<path>`). Run by
// `bun run test:slow`; it runs every unit test, so it is not in the gate.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, FileSystem, Path, Schema, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import { hashedBy, unhashed } from './test-reads/unhashed.js';

/** What this reads of turbo's dry run (`--dry=json`). */
const DryRun = Schema.Struct({
  tasks: Schema.Array(
    Schema.Struct({
      taskId: Schema.String,
      package: Schema.String,
      directory: Schema.String,
      command: Schema.String,
      inputs: Schema.Record(Schema.String, Schema.String),
      dependencies: Schema.Array(Schema.String),
    }),
  ),
});

const drain = <E>(stream: Stream.Stream<Uint8Array, E>) => Stream.runDrain(stream);

Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner;
  // packages/scripts/src → the repo root, as the preload resolves paths.
  const root = yield* fs.realPath(path.resolve(import.meta.dir, '..', '..', '..'));
  const preload = path.join(import.meta.dir, 'test-reads', 'preload.ts');
  const dry = yield* spawner
    .string(
      ChildProcess.make('node_modules/.bin/turbo', ['run', 'test', '--dry=json'], {
        cwd: root,
        forceKillAfter: '5 seconds',
      }),
    )
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(DryRun))));
  const tests = dry.tasks
    .filter((task) => task.taskId === `${task.package}#test` && task.command !== '<NONEXISTENT>')
    .toSorted((a, b) => a.package.localeCompare(b.package));
  const scratch = yield* fs.makeTempDirectoryScoped({ prefix: 'test-reads-' });

  const failures = yield* Effect.forEach(tests, (task) =>
    Effect.gen(function* () {
      const log = path.join(scratch, `${task.package.replace('/', '_')}.reads`);
      yield* fs.writeFileString(log, '');
      const code = yield* Effect.scoped(
        Effect.flatMap(
          spawner.spawn(
            ChildProcess.make('bun', ['run', 'test'], {
              cwd: path.join(root, task.directory),
              env: { BUN_OPTIONS: `--preload=${preload}`, MANNA_TEST_READS: log },
              extendEnv: true,
              forceKillAfter: '5 seconds',
            }),
          ),
          (child) =>
            Effect.map(
              Effect.all([drain(child.stdout), drain(child.stderr), child.exitCode], {
                concurrency: 3,
              }),
              ([, , exit]) => Number(exit),
            ),
        ),
      );
      const reads = (yield* fs.readFileString(log)).split('\n').filter((line) => line !== '');
      const candidates = unhashed(root, reads, hashedBy(dry.tasks, task.taskId));
      const files = yield* Effect.filter(candidates, (file) =>
        fs.stat(path.join(root, file)).pipe(
          Effect.map((info) => info.type === 'File'),
          Effect.orElseSucceed(() => false),
        ),
      );
      yield* Console.log(
        `test-reads ${task.package}: test exit ${code}, ${new Set(reads).size} paths read, ${files.length} not hashed`,
      );
      yield* Effect.forEach(files, (file) => Console.log(`  not hashed: ${file}`), {
        discard: true,
      });
      return files.length + Number(code !== 0);
    }),
  );
  const failed = failures.reduce((sum, each) => sum + each, 0);
  yield* Console.log(`test-reads: ${tests.length} workspaces, ${failed} failures`);
  yield* Effect.sync(() => {
    process.exitCode = Number(failed > 0);
  });
}).pipe(Effect.scoped, Effect.provide(BunServices.layer), BunRuntime.runMain);
