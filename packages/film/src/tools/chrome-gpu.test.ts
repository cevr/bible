// The GPU launcher passes on every argument Bun gives Chrome but
// `--disable-gpu`, in order, to the Chrome it names, run here as a stand-in
// that prints them. No Chromium.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Path } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { gpuLauncher } from './chrome-gpu.ts';
import { collect } from './process.ts';

/** A stand-in Chrome: it prints each argument it was given on a line of its own. */
const PRINTER = '#!/bin/sh\nfor arg do printf \'%s\\n\' "$arg"; done\n';

describe('the GPU launcher', () => {
  it.effect.layer(BunServices.layer)(
    "execs the Chrome it names with Bun's arguments in order, but --disable-gpu",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
          const root = yield* fs.makeTempDirectoryScoped();
          // A Chrome's path, as macOS's has, with a space and a quote in it.
          const chrome = path.join(root, "Google Chrome's.app");
          const launcher = path.join(root, 'launcher');
          yield* fs.writeFileString(chrome, PRINTER, { mode: 0o755 });
          yield* fs.writeFileString(launcher, gpuLauncher(chrome), { mode: 0o755 });
          const bun = [
            '--user-data-dir=/tmp/a profile',
            '--remote-debugging-pipe',
            '--headless',
            '--disable-gpu',
            '--enable-gpu',
            '--disable-gpu-vsync',
            '',
          ];
          const run = yield* collect(
            spawner,
            ChildProcess.make(launcher, bun, { forceKillAfter: '5 seconds' }),
          );
          expect(run.exitCode).toBe(0);
          expect(run.stdout.split('\n').slice(0, -1)).toEqual([
            '--user-data-dir=/tmp/a profile',
            '--remote-debugging-pipe',
            '--headless',
            '--enable-gpu',
            '--disable-gpu-vsync',
            '',
          ]);
        }),
      ),
    20_000,
  );
});
