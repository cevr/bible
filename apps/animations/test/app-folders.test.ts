// Where a run writes is the app's folder, not the shell's: the CLI started
// from another directory still writes its outputs under the app's `out/`.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Path, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { FIXTURE_FILM, appDir, spawnBudget } from './cli-run.ts';

describe('the app folders', () => {
  it.effect(
    'a run started outside the app writes under the app’s out/',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const app = yield* appDir;
        const elsewhere = yield* fs.makeTempDirectoryScoped();
        const folder = path.join(app, 'out', FIXTURE_FILM);
        const sheet = path.join(folder, 'script-sheet');
        // The sheet this run writes goes when the test does, and its folder if the run made it.
        const made = !(yield* fs.exists(folder));
        yield* Effect.addFinalizer(() =>
          Effect.forEach([`${sheet}.md`, `${sheet}.html`, ...[folder].filter(() => made)], (file) =>
            fs.remove(file, { force: true, recursive: true }).pipe(Effect.ignore),
          ),
        );
        const handle = yield* (yield* ChildProcessSpawner.ChildProcessSpawner).spawn(
          ChildProcess.make(
            'bun',
            [path.join(app, 'test/fixtures/cli.ts'), 'script', FIXTURE_FILM, '--sheet'],
            { cwd: elsewhere, extendEnv: true },
          ),
        );
        const printed = yield* Stream.mkString(Stream.decodeText(handle.stdout));
        expect(Number(yield* handle.exitCode)).toBe(0);
        expect(printed.split('\n').filter((line) => line !== '')).toEqual([
          `${sheet}.md`,
          `${sheet}.html`,
        ]);
        expect(yield* fs.exists(path.join(elsewhere, 'out'))).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    spawnBudget(1),
  );
});
