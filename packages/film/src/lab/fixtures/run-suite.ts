// One invocation owns the fixture bundles and the child test process. Its
// temporary files are released only after the workers have exited. A
// `--parallel` run takes as many workers as `workersFor` gives the host.

import { availableParallelism, loadavg } from 'node:os';
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Config, Console, Effect, FileSystem, Stdio } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import { ENTRIES, compile } from './bundles.ts';
import { workersFor } from './workers.ts';

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
  const [load = 0] = loadavg();
  const ci = yield* Config.Boolean('CI').pipe(Config.withDefault(false));
  const cores = availableParallelism();
  const workers = workersFor({ cores, load, ci });
  if (args.includes('--parallel'))
    yield* Console.log(
      `run-suite: ${workers} workers (${cores} cores, load ${load.toFixed(1)}, CI ${ci})`,
    );
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
