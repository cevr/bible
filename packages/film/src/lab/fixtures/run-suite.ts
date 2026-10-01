// One invocation owns the fixture bundles and the child test process. Its
// temporary files are released only after the workers have exited.

import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Stdio } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import { ENTRIES, compile } from './bundles.ts';

const run = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'film-test-bundles-' });
  yield* Effect.forEach(
    ENTRIES,
    (entry) =>
      Effect.flatMap(compile(entry), (script) => fs.writeFileString(`${dir}/${entry}.js`, script)),
    { concurrency: 3 },
  );
  const args = yield* (yield* Stdio.Stdio).args;
  const workers = Math.min(8, navigator.hardwareConcurrency);
  const spawner = yield* ChildProcessSpawner;
  const child = yield* spawner.spawn(
    ChildProcess.make(
      process.execPath,
      [
        'test',
        ...args.map((arg) => {
          if (arg === '--parallel') return `--parallel=${workers}`;
          return arg;
        }),
      ],
      {
        env: { FILM_TEST_BUNDLES: dir },
        extendEnv: true,
        stdin: 'inherit',
        stdout: 'inherit',
        stderr: 'inherit',
      },
    ),
  );
  const code = yield* child.exitCode;
  yield* Effect.sync(() => {
    process.exitCode = code;
  });
}).pipe(Effect.scoped, Effect.provide(BunServices.layer));

BunRuntime.runMain(run);
