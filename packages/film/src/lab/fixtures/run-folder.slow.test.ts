// The e2e run's folder: its release ends the processes that name a path in
// it and waits until none runs, then removes it (`run-folder.ts`).

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Exit, FileSystem, Path, Scope, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import { namingFolder, namingProcesses, runFolder } from './run-folder.ts';

/** The timeout of a test that starts a process of its own: a cold start's time is the machine's. */
const SPAWNS_MS = 30_000;

describe("an e2e run's folder", () => {
  it.effect(
    'names the processes whose command line names a path in the folder, this one left out',
    () =>
      Effect.sync(() => {
        const ps = [
          '  101 /Applications/Chrome --user-data-dir=/tmp/run-a/chrome/7 --headless',
          '  102 /Applications/Chrome Helper --type=renderer --user-data-dir=/tmp/run-a/chrome/7',
          '  103 /Applications/Chrome --user-data-dir=/tmp/run-ab/chrome/7',
          '  104 bun test --user-data-dir=/tmp/run-a/chrome/8',
          '  105 ps -A -o pid= -o command=',
        ].join('\n');
        expect(namingFolder(ps, '/tmp/run-a', 104)).toEqual([101, 102]);
      }),
  );

  it.live(
    'its release ends a process still writing in it and waits until it has, then removes it',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner;
        const run = yield* Scope.make();
        const folder = yield* Scope.provide(runFolder('film-test-run-folder-'), run);
        const holder = yield* spawner.spawn(
          ChildProcess.make(
            'bun',
            [path.join(import.meta.dir, 'profile-holder.ts'), `--user-data-dir=${folder}/chrome/1`],
            { forceKillAfter: '5 seconds' },
          ),
        );
        yield* holder.stdout.pipe(
          Stream.decodeText(),
          Stream.takeUntil((chunk) => chunk.includes('ready')),
          Stream.runDrain,
        );
        yield* Scope.close(run, Exit.void);
        // Released: no process names the folder, and the holder's last write landed before the remove.
        expect(yield* namingProcesses(folder)).toEqual([]);
        yield* holder.exitCode;
        expect(yield* fs.exists(folder)).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    SPAWNS_MS,
  );
});
