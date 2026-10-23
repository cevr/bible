/**
 * The stream against a fake sampler and a fake R2, on a real folder in the
 * temp directory: the fake renderer writes what `render.ts` writes (the MP3,
 * its record, a work folder), R2 is a `Ref` of objects, so a run of 20 hymns
 * takes milliseconds and touches no network.
 */
import * as BunServices from '@effect/platform-bun/BunServices';
import { KEY_TRANSPOSES } from '@bible/hymnal/recordings';
import { describe, expect, it } from 'effect-bun-test';
import {
  Console,
  Deferred,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Path,
  Ref,
  Result,
  Schema,
} from 'effect';

import { HashBun } from './hash-bun.ts';
import type { PutMetadata, TargetObject } from './stores.ts';
import { Hash, StoreFailed, Target } from './stores.ts';
import { hymnsOf, keysOf, Renderer, setDirs, stream, type StreamOptions } from './stream-job.ts';
import { SET_CACHE_CONTROL, setKey } from './upload-plan.ts';

const sha256Hex = (bytes: Uint8Array) => {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(bytes);
  return hasher.digest('hex');
};

const recording = (hymn: number, transpose: number) =>
  new TextEncoder().encode(`recording of hymn ${hymn} at ${transpose}`);

interface Fakes {
  /** R2's objects by key. */
  readonly r2: Ref.Ref<ReadonlyMap<string, TargetObject>>;
  readonly puts: Ref.Ref<ReadonlyArray<{ key: string; metadata: PutMetadata }>>;
  readonly renders: Ref.Ref<ReadonlyArray<number>>;
  readonly manifests: Ref.Ref<number>;
  /** The most hymns' MP3s and work folders seen on disk at once. */
  readonly peak: Ref.Ref<number>;
}

interface Behaviour {
  /** Hymns whose render fails a check. */
  readonly failing?: ReadonlySet<number>;
  /** Hymns whose upload R2 refuses. */
  readonly refused?: ReadonlySet<number>;
  /** A hymn whose render never ends: the run is stopped there. */
  readonly hang?: { readonly hymn: number; readonly started: Deferred.Deferred<number> };
  /** Each hymn's moved stems, as the record holds them. */
  readonly moves?: ReadonlyMap<
    number,
    ReadonlyArray<{ stem: string; octave: number; folded: number }>
  >;
}

const fakesOf = Effect.gen(function* () {
  return {
    r2: yield* Ref.make<ReadonlyMap<string, TargetObject>>(new Map()),
    puts: yield* Ref.make<ReadonlyArray<{ key: string; metadata: PutMetadata }>>([]),
    renders: yield* Ref.make<ReadonlyArray<number>>([]),
    manifests: yield* Ref.make(0),
    peak: yield* Ref.make(0),
  } satisfies Fakes;
});

/** A record as `render.ts` writes it, by the fields the stream reads and a few more. */
const FakeRecord = Schema.fromJsonString(
  Schema.Struct({
    hymn: Schema.Int,
    passed: Schema.Boolean,
    file: Schema.String,
    bytes: Schema.Int,
    sha256: Schema.String,
    md5: Schema.String,
    transpose: Schema.Int,
    moves: Schema.optional(
      Schema.Array(Schema.Struct({ stem: Schema.String, octave: Schema.Int, folded: Schema.Int })),
    ),
  }),
);

/** The hymns whose MP3 or work folder is on disk now. */
const onDisk = (fs: FileSystem.FileSystem, out: string, work: string) =>
  Effect.gen(function* () {
    const mp3s = (yield* fs.readDirectory(out)).filter((f) => f.endsWith('.mp3'));
    const works = yield* fs.readDirectory(work).pipe(Effect.orElseSucceed(() => []));
    return new Set([...mp3s.map((f) => f.slice(0, -4)), ...works]).size;
  });

const layerOf = (fakes: Fakes, behaviour: Behaviour = {}) => {
  const target = Layer.succeed(
    Target,
    Target.of({
      list: (prefix) =>
        Ref.get(fakes.r2).pipe(
          Effect.map((all) => new Map([...all].filter(([key]) => key.startsWith(prefix)))),
        ),
      put: (key, bytes, metadata) =>
        Effect.gen(function* () {
          const hymn = Number(/(\d+)\.mp3$/.exec(key)?.[1]);
          if (behaviour.refused?.has(hymn))
            return yield* StoreFailed.make({ store: 'r2', reason: `put ${key}: refused` });
          const object = {
            size: bytes.byteLength,
            etag: `"${new Bun.CryptoHasher('md5').update(bytes).digest('hex')}"`,
          };
          yield* Ref.update(fakes.r2, (all) => new Map([...all, [key, object]]));
          yield* Ref.update(fakes.puts, (all) => [...all, { key, metadata }]);
          return object;
        }),
    }),
  );
  const renderer = Layer.effect(
    Renderer,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const hash = yield* Hash;
      return Renderer.of({
        render: ({ hymn, transpose, out, work }) =>
          Effect.gen(function* () {
            yield* Ref.update(fakes.renders, (all) => [...all, hymn]);
            yield* fs.makeDirectory(path.join(work, String(hymn)), { recursive: true });
            yield* fs.writeFileString(path.join(work, String(hymn), 'piano.wav'), 'stem');
            if (behaviour.hang?.hymn === hymn) {
              yield* fs.writeFileString(path.join(out, `${hymn}.mp3.part`), 'half');
              yield* Deferred.succeed(behaviour.hang.started, hymn);
              return yield* Effect.never;
            }
            yield* Effect.yieldNow;
            const bytes = recording(hymn, transpose);
            yield* fs.writeFile(path.join(out, `${hymn}.mp3`), bytes);
            const record = {
              hymn,
              passed: !(behaviour.failing?.has(hymn) ?? false),
              file: `${hymn}.mp3`,
              bytes: bytes.byteLength,
              sha256: sha256Hex(bytes),
              md5: hash.md5(bytes),
              transpose,
              moves: behaviour.moves?.get(hymn),
            };
            yield* fs.writeFileString(
              path.join(out, `${hymn}.json`),
              yield* Schema.encodeEffect(FakeRecord)(record),
            );
            const now = yield* onDisk(fs, out, work);
            yield* Ref.update(fakes.peak, (peak) => Math.max(peak, now));
            yield* Effect.yieldNow;
            if (!record.passed) return { code: 1, tail: `${hymn} FAIL lufs` };
            return { code: 0, tail: '' };
          }).pipe(Effect.orDie),
        manifest: ({ out }) =>
          Effect.gen(function* () {
            yield* Ref.update(fakes.manifests, (n) => n + 1);
            yield* fs.writeFileString(path.join(out, 'manifest.json'), '{}');
            return { code: 0, tail: '' };
          }).pipe(Effect.orDie),
      });
    }),
  );
  // The lines are read from the log file; the console stays quiet.
  const quiet = Layer.succeed(Console.Console, { ...globalThis.console, log: () => {} });
  return Layer.mergeAll(target, renderer.pipe(Layer.provide(HashBun)), HashBun, quiet);
};

/** The stream over the fakes. */
const streamed = (options: StreamOptions, fakes: Fakes, behaviour: Behaviour = {}) =>
  stream(options).pipe(Effect.provide(layerOf(fakes, behaviour)));

/** A cache folder in the temp directory, removed with the test's scope. */
const cacheDir = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.makeTempDirectoryScoped({ prefix: 'hymn-stream-' });
});

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const logOf = (cache: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return (yield* fs.readFileString(path.join(cache, 'stream.log'))).trim().split('\n');
  });

describe('the stream', () => {
  it.scopedLive.layer(BunServices.layer)(
    'streams 20 hymns with no more than --parallel MP3s and work folders on disk, leaving records and a manifest',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const cache = yield* cacheDir;
        const fakes = yield* fakesOf;
        const hymns = range(1, 20);
        const result = yield* streamed({ cache, keys: [2], hymns, parallel: 4 }, fakes);
        expect(result.failed).toBe(0);
        const peak = yield* Ref.get(fakes.peak);
        expect(peak).toBeGreaterThan(1);
        expect(peak).toBeLessThanOrEqual(4);
        const { out, work } = setDirs(cache, 'warm-1-up2');
        const left = (yield* fs.readDirectory(out)).sort();
        expect(left).toEqual([...hymns.map((h) => `${h}.json`), 'manifest.json'].sort());
        expect(yield* fs.readDirectory(work)).toEqual([]);
        const r2 = yield* Ref.get(fakes.r2);
        for (const hymn of hymns) {
          const bytes = recording(hymn, 2);
          expect(r2.get(setKey('warm-1-up2', hymn))?.size).toBe(bytes.byteLength);
        }
        for (const { metadata } of yield* Ref.get(fakes.puts))
          expect(metadata).toEqual({ contentType: 'audio/mpeg', cacheControl: SET_CACHE_CONTROL });
        const log = yield* logOf(cache);
        for (const hymn of hymns)
          expect(log.filter((l) => l.startsWith(`key warm-1-up2 hymn ${hymn} `))).toEqual([
            expect.stringMatching(/ rendered \(/),
            expect.stringMatching(/ uploaded \(/),
          ]);
        expect(log.at(-1)).toBe(
          'key warm-1-up2 done: rendered 20 kept 0 uploaded 20 failed 0 of 20',
        );
        expect(yield* Ref.get(fakes.manifests)).toBe(1);
      }),
  );

  it.scopedLive.layer(BunServices.layer)(
    'resumes after a stop: what R2 holds is kept, the stopped hymn renders again, an object of other bytes is never trusted',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cache = yield* cacheDir;
        const fakes = yield* fakesOf;
        const started = yield* Deferred.make<number>();
        const hymns = range(1, 8);
        const first = yield* streamed({ cache, keys: [-3], hymns, parallel: 1 }, fakes, {
          hang: { hymn: 5, started },
        }).pipe(Effect.forkChild);
        yield* Deferred.await(started);
        yield* Fiber.interrupt(first);
        expect(yield* Ref.get(fakes.renders)).toEqual([1, 2, 3, 4, 5]);

        // R2 holds hymn 3 with other bytes, as a partial upload would leave it.
        const key3 = setKey('warm-1-down3', 3);
        const partial = { size: 4, etag: '"0123"' };
        yield* Ref.update(fakes.r2, (all) => new Map([...all, [key3, partial]]));
        const again = yield* fakesOf;
        yield* Ref.set(again.r2, yield* Ref.get(fakes.r2));
        const result = yield* streamed({ cache, keys: [-3], hymns, parallel: 1 }, again);
        expect(yield* Ref.get(again.renders)).toEqual([3, 5, 6, 7, 8]);
        expect((yield* Ref.get(again.puts)).map((p) => p.key)).toEqual(
          [5, 6, 7, 8].map((h) => setKey('warm-1-down3', h)),
        );
        expect((yield* Ref.get(again.r2)).get(key3)).toEqual(partial);
        expect(result.failed).toBe(1);
        const { out } = setDirs(cache, 'warm-1-down3');
        expect(yield* fs.exists(path.join(out, '3.mp3'))).toBe(true);
        const log = yield* logOf(cache);
        for (const hymn of [1, 2, 4])
          expect(log.some((l) => l.startsWith(`key warm-1-down3 hymn ${hymn} kept`))).toBe(true);
        expect(
          log.some((l) =>
            l.startsWith(
              'key warm-1-down3 hymn 3 failed: r2 holds audio/warm-1-down3/sdah/3.mp3 as etag 0123 size 4',
            ),
          ),
        ).toBe(true);
      }),
  );

  it.scopedLive.layer(BunServices.layer)(
    'uploads no hymn that failed a check, keeps its record, and goes on',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cache = yield* cacheDir;
        const fakes = yield* fakesOf;
        const result = yield* streamed({ cache, keys: [1], hymns: [1, 2, 3], parallel: 2 }, fakes, {
          failing: new Set([2]),
        });
        expect(result.failed).toBe(1);
        expect((yield* Ref.get(fakes.puts)).map((p) => p.key)).toEqual(
          [1, 3].map((h) => setKey('warm-1-up1', h)),
        );
        const { out, work } = setDirs(cache, 'warm-1-up1');
        expect(yield* fs.exists(path.join(out, '2.json'))).toBe(true);
        expect(yield* fs.exists(path.join(out, '2.mp3'))).toBe(false);
        expect(yield* fs.readDirectory(work)).toEqual([]);
        const log = yield* logOf(cache);
        expect(log.some((l) => l.startsWith('key warm-1-up1 hymn 2 failed: 2 FAIL lufs'))).toBe(
          true,
        );
      }),
  );

  it.scopedLive.layer(BunServices.layer)('keeps the local MP3 when its upload fails', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const cache = yield* cacheDir;
      const fakes = yield* fakesOf;
      const result = yield* streamed({ cache, keys: [4], hymns: [1, 2], parallel: 2 }, fakes, {
        refused: new Set([2]),
      });
      expect(result.failed).toBe(1);
      const { out } = setDirs(cache, 'warm-1-up4');
      expect(yield* fs.exists(path.join(out, '1.mp3'))).toBe(false);
      expect(yield* fs.exists(path.join(out, '2.mp3'))).toBe(true);
      const log = yield* logOf(cache);
      expect(log.some((l) => l.startsWith('key warm-1-up4 hymn 2 failed: r2: put'))).toBe(true);
    }),
  );

  it.scopedLive.layer(BunServices.layer)(
    "takes the keys in the stepper's order and names each moved part by hymn and key",
    () =>
      Effect.gen(function* () {
        const cache = yield* cacheDir;
        const fakes = yield* fakesOf;
        const moves = new Map([[1, [{ stem: 'bass', octave: 12, folded: 0 }]]]);
        yield* streamed({ cache, keys: KEY_TRANSPOSES, hymns: [1], parallel: 1 }, fakes, { moves });
        const log = yield* logOf(cache);
        const sets = log.filter((l) => l.includes(' done: ')).map((l) => l.split(' ')[1]);
        expect(sets).toEqual([
          'warm-1-up1',
          'warm-1-down1',
          'warm-1-up2',
          'warm-1-down2',
          'warm-1-up3',
          'warm-1-down3',
          'warm-1-up4',
          'warm-1-down4',
          'warm-1-up5',
          'warm-1-down5',
          'warm-1-up6',
        ]);
        expect(log).toContain(
          'key warm-1-down5 hymn 1 rendered, moved bass +12 (rendered 1 kept 0 uploaded 0 failed 0 of 1)',
        );
      }),
  );
});

describe('the keys flag', () => {
  it.effect('reads all, or a list of transposes from -5 to 6 other than 0', () =>
    Effect.sync(() => {
      expect(keysOf('all')).toEqual(Result.succeed(KEY_TRANSPOSES));
      expect(keysOf('2,-3')).toEqual(Result.succeed([2, -3]));
      for (const refused of ['0', '7', '-6', '1.5', 'up2', ''])
        expect(Result.isFailure(keysOf(refused))).toBe(true);
    }),
  );

  it.effect('reads hymn numbers from 1 to 695', () =>
    Effect.sync(() => {
      expect(hymnsOf('1,46, 663')).toEqual(Result.succeed([1, 46, 663]));
      for (const refused of ['0', '696', '1.5', 'one', ''])
        expect(Result.isFailure(hymnsOf(refused))).toBe(true);
    }),
  );
});
