// ContentStore: updates finishing together all land, in one process or many,
// one writer holding a manifest's lock at a time; a writer that dies lets it
// go at once; and a current hash skips the work.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import {
  Array as Arr,
  Cause,
  Context,
  Deferred,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
  Stream,
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { TestClock } from 'effect/testing';
import { type SoundManifest, SoundManifestJson } from '../core/schema.ts';
import { ContentStore, type Manifest } from './content-store.ts';
import { ManifestLock, type ManifestLockService } from './manifest-lock.ts';
import { bunManifestLock, lockFile } from './manifest-lock-bun.ts';
import { memoryFileSystem, memoryManifestLock, storeLayer } from './testing.ts';

const manifest: Manifest<SoundManifest> = {
  file: '/films/test/sound/manifest.json',
  codec: SoundManifestJson,
  empty: {},
};

/** A generated file, keyed by its request's hash. */
const Asset = Schema.Struct({ hash: Schema.String, file: Schema.String });

/** A manifest of many keyed assets, so racing updates each add their own. */
const Assets = Schema.Struct({ assets: Schema.Record(Schema.String, Asset) });
const assets: Manifest<typeof Assets.Type> = {
  file: '/films/test/assets.json',
  codec: Schema.fromJsonString(Assets),
  empty: { assets: {} },
};

/**
 * A store over `files`, its locks `locks`: another process, as far as its
 * locks know, beside every other store over the same ones.
 */
const storeOn = (files: Map<string, Uint8Array>, locks: ManifestLockService) =>
  Effect.map(
    Layer.build(
      ContentStore.layer.pipe(
        Layer.provide([memoryFileSystem(files), Path.layer]),
        Layer.provide(Layer.succeed(ManifestLock, locks)),
      ),
    ),
    Context.get(ContentStore),
  );

/** A store of its own over the disk, its locks this host's: another process, as far as they know. */
const storeOnDisk = Effect.map(Layer.build(ContentStore.layer), Context.get(ContentStore));

/** An entry `key` added to the assets. */
const withAsset = (key: string) => (m: typeof Assets.Type) => ({
  assets: { ...m.assets, [key]: { hash: key, file: `${key}.flac` } },
});

/**
 * `effect` run while the test clock passes every wait a writer makes for
 * another's lock, from once `refused` (its first refusal, when the disk is
 * between it and its first try) is done.
 */
const waited = <A, E>(effect: Effect.Effect<A, E>, refused: Effect.Effect<unknown> = Effect.void) =>
  Effect.gen(function* () {
    const running = yield* Effect.forkChild(effect);
    yield* refused;
    for (let i = 0; i < 300; i += 1) yield* TestClock.adjust('20 millis');
    return yield* Fiber.join(running);
  });

/** Bun's lock, telling `refused` when it is refused. */
const tellingRefusal = (refused: Deferred.Deferred<boolean>): ManifestLockService => ({
  take: (file) =>
    bunManifestLock
      .take(file)
      .pipe(
        Effect.tap((got) =>
          Effect.when(Deferred.succeed(refused, true), Effect.succeed(Option.isNone(got))),
        ),
      ),
});

/** The timeout of a test that starts a process of its own: a cold start's time is the machine's. */
const SPAWNS_MS = 30_000;

describe('ContentStore', () => {
  it.effect('keeps every entry when updates race', () =>
    Effect.gen(function* () {
      const store = yield* ContentStore;
      const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
      yield* Effect.forEach(ids, (id) => store.update(assets, withAsset(id)), {
        concurrency: ids.length,
      });
      const stored = yield* store.read(assets);
      expect(Object.keys(stored.assets).toSorted()).toEqual(ids);
    }).pipe(Effect.provide(storeLayer(new Map()))),
  );

  it.live('two processes updating one manifest on disk lose no write, and leave no partial', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const shared = { ...assets, file: `${dir}/assets.json` };
      const [a, b] = [yield* storeOnDisk, yield* storeOnDisk];
      const burst = (store: typeof a, who: string) =>
        Effect.forEach(Arr.range(1, 20), (i) => store.update(shared, withAsset(`${who}${i}`)), {
          concurrency: 4,
        });
      yield* Effect.all([burst(a, 'a'), burst(b, 'b')], { concurrency: 2 });
      const stored = yield* Schema.decodeEffect(assets.codec)(
        yield* fs.readFileString(shared.file),
      );
      expect(Object.keys(stored.assets).length).toBe(40);
      // The manifest, and its lock file, which stays.
      expect((yield* fs.readDirectory(dir)).toSorted()).toEqual([
        '.assets.json.lock',
        'assets.json',
      ]);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.live(
    'writers of many stores at once on disk hold the lock one at a time, and lose no entry',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped();
        const shared = { ...assets, file: `${dir}/assets.json` };
        // Each change counts the writers inside at once, and goes to the disk
        // once inside, so any other writer let in meanwhile is counted.
        const inside = { now: 0, most: 0 };
        const change = (key: string) => (m: typeof Assets.Type) =>
          Effect.gen(function* () {
            inside.now += 1;
            inside.most = Math.max(inside.most, inside.now);
            yield* fs.exists(shared.file);
            inside.now -= 1;
            return [key, withAsset(key)(m)] as const;
          });
        const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        const stores = yield* Effect.forEach(keys, () => storeOnDisk);
        yield* Effect.forEach(
          Arr.zip(stores, keys),
          ([store, key]) => store.transact(shared, change(key)),
          { concurrency: keys.length },
        );
        expect(inside.most).toBe(1);
        const stored = yield* Schema.decodeEffect(assets.codec)(
          yield* fs.readFileString(shared.file),
        );
        expect(Object.keys(stored.assets).toSorted()).toEqual(keys);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect(
    'a writer killed holding the lock lets it go at once; alive, it holds however long',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* fs.makeTempDirectoryScoped();
        const shared = { ...assets, file: `${dir}/assets.json` };
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const holder = yield* spawner.spawn(
          ChildProcess.make('bun', [
            path.join(import.meta.dir, 'fixtures', 'hold-manifest.ts'),
            shared.file,
          ]),
        );
        const said = yield* holder.stdout.pipe(
          Stream.decodeText(),
          Stream.takeUntil((chunk) => chunk.includes('held')),
          Stream.mkString,
        );
        expect(said).toContain('held');
        // Another process holds it: this writer waits its whole wait, and is refused.
        const first = yield* Deferred.make<boolean>();
        const store = yield* storeOnDisk.pipe(
          Effect.provideService(ManifestLock, tellingRefusal(first)),
        );
        const refused = yield* waited(
          Effect.flip(store.update(shared, withAsset('x'))),
          Deferred.await(first),
        );
        expect(refused).toMatchObject({ _tag: 'StoreLocked', file: shared.file });
        // Killed where it stands: the next change lands at its first try, no clock passing.
        yield* holder.kill({ killSignal: 'SIGKILL' });
        yield* Effect.ignore(holder.exitCode);
        yield* store.update(shared, withAsset('x'));
        const stored = yield* store.read(shared);
        expect(Object.keys(stored.assets)).toEqual(['x']);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    SPAWNS_MS,
  );

  it.effect(
    'a holder in memory holds however long, and lets go when its change ends however it ends',
    () =>
      Effect.gen(function* () {
        const files = new Map<string, Uint8Array>();
        const locks = memoryManifestLock();
        const [lab, cli] = [yield* storeOn(files, locks), yield* storeOn(files, locks)];
        const holding = yield* Deferred.make<boolean>();
        const held = yield* Effect.forkChild(
          lab.holding(assets, () => Effect.andThen(Deferred.succeed(holding, true), Effect.never)),
        );
        yield* Deferred.await(holding);
        yield* TestClock.adjust('1 hour');
        const refused = yield* waited(Effect.flip(cli.update(assets, withAsset('x'))));
        expect(refused).toMatchObject({ _tag: 'StoreLocked', file: assets.file });
        // Its change cut short, as a process's end cuts it: the lock is let go.
        yield* Fiber.interrupt(held);
        yield* cli.update(assets, withAsset('x'));
        expect(Object.keys((yield* cli.read(assets)).assets)).toEqual(['x']);
      }).pipe(Effect.scoped),
  );

  it.live("the in-memory lock and Bun's: one holder, refused while held, free once let go", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const file = `${dir}/assets.json`;
      for (const locks of [memoryManifestLock(), bunManifestLock]) {
        const first = yield* locks.take(file);
        expect(Option.isSome(first)).toBe(true);
        expect(yield* locks.take(file)).toEqual(Option.none());
        yield* Option.getOrElse(first, () => Effect.void);
        const again = yield* locks.take(file);
        expect(Option.isSome(again)).toBe(true);
        yield* Option.getOrElse(again, () => Effect.void);
      }
      // Bun's, held, is one empty file beside the manifest: it writes no journal.
      const held = yield* bunManifestLock.take(file);
      expect(yield* fs.readDirectory(dir)).toEqual(['.assets.json.lock']);
      yield* Option.getOrElse(held, () => Effect.void);
      expect(Number((yield* fs.stat(lockFile(file))).size)).toBe(0);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('skips an asset whose hash is current, and makes a stale one', () =>
    Effect.gen(function* () {
      const store = yield* ContentStore;
      let made = 0;
      const ensure = (hash: string) =>
        store.ensure({
          manifest,
          hash,
          force: false,
          stored: (m) => Option.map(Option.fromNullishOr(m.scores?.['piano']), (a) => a.hash),
          produce: Effect.sync(() => ++made),
          record: () => ({ scores: { piano: { hash, file: `piano-${hash}.mp3`, sha256: hash } } }),
        });
      expect(yield* ensure('h1')).toEqual(Option.some(1));
      expect(yield* ensure('h1')).toEqual(Option.none());
      expect(yield* ensure('h2')).toEqual(Option.some(2));
      const text = yield* Schema.encodeEffect(SoundManifestJson)(yield* store.read(manifest));
      expect(text.endsWith('\n')).toBe(true);
    }).pipe(Effect.provide(storeLayer(new Map()))),
  );

  it.effect('a change that takes its own lock again dies naming it, never waiting on itself', () =>
    Effect.gen(function* () {
      const store = yield* storeOn(new Map(), memoryManifestLock());
      const again = [
        store.holding(assets, () => store.holding(assets, () => Effect.void)),
        store.holding(assets, () => store.update(assets, withAsset('x'))),
        store.transact(assets, (m) => store.holding(assets, () => Effect.succeed([1, m] as const))),
      ];
      for (const nested of again) {
        const exit = yield* Effect.exit(nested);
        expect(Exit.isFailure(exit) && Cause.pretty(exit.cause)).toContain(assets.file);
      }
      // Another manifest's lock, taken inside, is no lock taken again.
      yield* store.holding(assets, () => store.update(manifest, (m) => m));
      expect(Object.keys((yield* store.read(assets)).assets)).toEqual([]);
    }).pipe(Effect.scoped),
  );
});
