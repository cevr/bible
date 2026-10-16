// The GPU launcher passes on every argument Bun gives Chrome but
// `--disable-gpu`, in order, to the Chrome it names, run here as a stand-in
// that prints them, and execs it: the stand-in is the launcher's own process,
// so Bun's kill reaches Chrome. Only macOS's renderer flags ask for it. No
// Chromium.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Path } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { launchArgs } from './browser.ts';
import { gpuLauncher, throughGpuLauncher } from './chrome-gpu.ts';
import { collect } from './process.ts';

/** A stand-in Chrome: it prints its parent's pid, then each argument it was given, a line each. */
const PRINTER = '#!/bin/sh\nprintf \'%s\\n\' "$PPID"\nfor arg do printf \'%s\\n\' "$arg"; done\n';

describe('the GPU launcher', () => {
  it.effect.layer(BunServices.layer)(
    "execs the Chrome it names, in its own process, with Bun's arguments in order but --disable-gpu",
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
          // Exec'd, the stand-in's parent is this process, which spawned the launcher; else the launcher's shell.
          expect(run.stdout.split('\n').slice(0, -1)).toEqual([
            String(process.pid),
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

describe('which Chrome is spawned through the launcher', () => {
  it.effect('the renderer on macOS, which asks for the GPU', () =>
    Effect.sync(() => {
      expect(throughGpuLauncher('darwin', launchArgs('darwin'))).toBe(true);
    }),
  );

  it.effect('no Chrome on Linux, whatever its flags; none that asks for no GPU', () =>
    Effect.sync(() => {
      expect(throughGpuLauncher('linux', launchArgs('linux'))).toBe(false);
      expect(throughGpuLauncher('linux', launchArgs('darwin'))).toBe(false);
      expect(throughGpuLauncher('darwin', launchArgs('linux'))).toBe(false);
    }),
  );
});
