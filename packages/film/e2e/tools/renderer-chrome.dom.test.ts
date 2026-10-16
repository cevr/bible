// The renderer's Chrome on macOS runs its GPU: spawned through the GPU
// launcher, it has no `--disable-gpu` and keeps WebGL on SwiftShader, and it
// is the launcher's own process (exec'd), so its parent is the process that
// opened it. When it dies, the next view's Chrome is spawned the same way,
// in the same profile. Read from `ps` in a process of its own
// (`src/tools/fixtures/renderer-chrome.ts`). macOS only: no other platform
// asks for the GPU.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { collect } from '../../src/tools/process.ts';

const Seen = Schema.fromJsonString(
  Schema.Struct({
    pid: Schema.Finite,
    first: Schema.Array(Schema.String),
    second: Schema.Array(Schema.String),
  }),
);

/** A Chrome command line's flags, its executable's path (which has spaces) left out. */
const flagsOf = (line: string) => line.split(/\s+/).filter((word) => word.startsWith('--'));

describe("the renderer's Chrome on macOS", () => {
  it.effect.layer(BunServices.layer)(
    "runs its GPU, exec'd by the launcher, and a Chrome spawned again after it died does too, in the same profile",
    () =>
      Effect.gen(function* () {
        if (process.platform !== 'darwin') return;
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const run = yield* collect(
          spawner,
          ChildProcess.make(
            process.execPath,
            [`${import.meta.dir}/../../src/tools/fixtures/renderer-chrome.ts`],
            { forceKillAfter: '5 seconds' },
          ),
        );
        expect(run.exitCode).toBe(0);
        const seen = yield* Schema.decodeEffect(Seen)(run.stdout.trim());
        for (const chromes of [seen.first, seen.second]) {
          // One Chrome whose parent is the fixture: the launcher exec'd it.
          expect(chromes).toHaveLength(1);
          const flags = flagsOf(chromes[0] ?? '');
          expect(flags).not.toContain('--disable-gpu');
          expect(flags).toContain('--use-angle=swiftshader');
        }
        /** The profile folder a Chrome was spawned with. */
        const dataDir = (chromes: ReadonlyArray<string>) =>
          flagsOf(chromes[0] ?? '').find((flag) => flag.startsWith('--user-data-dir='));
        expect(dataDir(seen.second)).toBe(dataDir(seen.first));
        expect(dataDir(seen.first)).toEndWith(`/${seen.pid}`);
      }).pipe(Effect.scoped),
    30_000,
  );
});
