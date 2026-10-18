/**
 * The fidelity test's compiler, run off the test's thread so the 695 fresh
 * compiles share the machine's cores (Effect's `BunWorkerRunner`; the test
 * spawns it through `BunWorker`). Given hymn numbers, it compiles each from
 * its hymnal.db row and its MIDI file, through `sourceOf` and `compile` as
 * the compile script does, and sends each hymn back as soon as it is done:
 * the hymn, or why it failed. The oracle stays in the test: this file builds
 * no expected line.
 */

import { HymnalService, HymnId } from '@bible/core/hymnal';
import { layerHymnalBun } from '@bible/core/hymnal/bun';
import { BunWorkerRunner } from '@effect/platform-bun';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Cause, ConfigProvider, Effect, FileSystem, Layer, Result } from 'effect';
import * as WorkerRunner from 'effect/workers/WorkerRunner';

import { decodeOrders, sourceOf } from '../scripts/sources.js';
import { compile } from './compile.js';
import type { Hymn } from './hymn.js';

/** One hymn compiled, or why it failed (the test reads the same shape). */
type Done =
  | { readonly number: number; readonly hymn: Hymn }
  | { readonly number: number; readonly failure: string };

const data = (file: string) => new URL(`../data/${file}`, import.meta.url).pathname;

const layer = Layer.merge(
  layerHymnalBun.pipe(
    Layer.provide(BunServices.layer),
    Layer.provide(
      ConfigProvider.layer(
        ConfigProvider.fromEnv({
          env: { HOME: '/', HYMNAL_DB_PATH: data('../../core/data/hymnal.db') },
        }),
      ),
    ),
  ),
  BunServices.layer,
);

/**
 * Each of `numbers` compiled in turn, each sent as it is done. Every hymn
 * is answered: one whose row, file or refrains.json cannot be read is sent
 * as a failure that says why.
 */
const compileAll = (numbers: readonly number[], send: (done: Done) => Effect.Effect<void>) =>
  Effect.gen(function* () {
    const orders = yield* Effect.cached(
      Effect.flatMap(
        Effect.flatMap(FileSystem.FileSystem, (fs) =>
          fs.readFileString(data('fixes/refrains.json')),
        ),
        decodeOrders,
      ),
    );
    for (const n of numbers) {
      const done = yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const row = yield* (yield* HymnalService).getHymn(HymnId.make(n));
        const midi = yield* fs.readFile(data(`midi/${String(n).padStart(3, '0')}.mid`));
        const result = yield* Effect.result(
          sourceOf({ number: n, name: row.name, verses: row.verses }, midi, yield* orders).pipe(
            Effect.flatMap(compile),
          ),
        );
        return Result.isSuccess(result)
          ? { number: n, hymn: result.success }
          : { number: n, failure: `compile failed: ${result.failure._tag}` };
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.succeed({ number: n, failure: `not compiled: ${Cause.pretty(cause)}` }),
        ),
      );
      yield* send(done);
    }
  });

const serve = Effect.gen(function* () {
  const runner = yield* (yield* WorkerRunner.WorkerRunnerPlatform).start<Done, readonly number[]>();
  return yield* runner.run((_port, numbers) => compileAll(numbers, (done) => runner.send(0, done)));
});

Effect.runFork(serve.pipe(Effect.provide(Layer.merge(BunWorkerRunner.layer, layer))));
