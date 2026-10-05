// ContentStore: updates finishing together all land, in one process or two,
// and a current hash skips the work.

import { BunServices } from '@effect/platform-bun';
import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import {
  Array as Arr,
  Clock,
  Context,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
} from 'effect';
import { TestClock } from 'effect/testing';
import { type SoundManifest, SoundManifestJson } from '../core/schema.ts';
import {
  ContentStore,
  LockOwnerJson,
  type Manifest,
  Processes,
  lockFile,
  lockVerdict,
} from './content-store.ts';
import { memoryFileSystem, storeLayer, text } from './testing.ts';

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
 * A store over `files`, whose file system refuses to create a file that is
 * there (`wx`), as a disk does: another process, as far as any lock knows.
 */
const storeOn = (files: Map<string, Uint8Array>) =>
  Effect.map(
    Layer.build(ContentStore.layer.pipe(Layer.provide([memoryFileSystem(files), Path.layer]))),
    Context.get(ContentStore),
  );

/** `effect` run while the test clock passes every wait a writer makes for another's lock. */
const waited = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.gen(function* () {
    const running = yield* Effect.forkChild(effect);
    for (let i = 0; i < 300; i += 1) yield* TestClock.adjust('20 millis');
    return yield* Fiber.join(running);
  });

describe('ContentStore', () => {
  it.effect('keeps every entry when updates race', () =>
    Effect.gen(function* () {
      const store = yield* ContentStore;
      const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
      yield* Effect.forEach(
        ids,
        (id) =>
          store.update(assets, (m) => ({
            assets: { ...m.assets, [id]: { hash: id, file: `${id}.flac` } },
          })),
        { concurrency: ids.length },
      );
      const stored = yield* store.read(assets);
      expect(Object.keys(stored.assets).toSorted()).toEqual(ids);
    }).pipe(Effect.provide(storeLayer(new Map()))),
  );

  it.live('two processes updating one manifest on disk lose no write, and leave no partial', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const shared = { ...assets, file: `${dir}/assets.json` };
      // Each store is its own layer: another process, as far as any lock knows.
      const own = Effect.map(Layer.build(ContentStore.layer), Context.get(ContentStore));
      const [a, b] = [yield* own, yield* own];
      const burst = (store: typeof a, who: string) =>
        Effect.forEach(
          Arr.range(1, 20),
          (i) =>
            store.update(shared, (m) => ({
              assets: { ...m.assets, [`${who}${i}`]: { hash: who, file: `${who}${i}.flac` } },
            })),
          { concurrency: 4 },
        );
      yield* Effect.all([burst(a, 'a'), burst(b, 'b')], { concurrency: 2 });
      const stored = yield* Schema.decodeEffect(assets.codec)(
        yield* fs.readFileString(shared.file),
      );
      expect(Object.keys(stored.assets).length).toBe(40);
      expect(yield* fs.readDirectory(dir)).toEqual(['assets.json']);
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

  it.live('breaking a stale lock never clobbers a lock a third writer took meanwhile', () =>
    Effect.gen(function* () {
      const real = yield* FileSystem.FileSystem;
      const dir = yield* real.makeTempDirectoryScoped();
      const shared = { ...assets, file: `${dir}/assets.json` };
      const lock = lockFile(shared.file);
      const now = yield* Clock.currentTimeMillis;
      const owner = (pid: number, token: string) =>
        Schema.encodeSync(LockOwnerJson)({ pid, created: now, token });
      // Left by a crash: a pid no process has.
      yield* real.writeFileString(lock, owner(2 ** 22 + 7, 'crashed'));
      // The race, played in order around this writer's break: another writer
      // breaks the crashed lock and takes its own just before this one moves
      // it aside, and a third takes the lock the moment it is moved.
      let raced = false;
      const seen: Array<string> = [];
      const racing = FileSystem.FileSystem.of({
        ...real,
        rename: (from, to) => {
          if (raced || from !== lock) return real.rename(from, to);
          raced = true;
          return real
            .writeFileString(lock, owner(process.pid, 'second'))
            .pipe(
              Effect.andThen(real.rename(from, to)),
              Effect.andThen(real.writeFileString(lock, owner(process.pid, 'third'))),
            );
        },
        // What the lock holds when this writer next judges it; then the third lets go.
        readFileString: (file, encoding) =>
          real.readFileString(file, encoding).pipe(
            Effect.tap((text) =>
              Effect.when(
                Effect.sync(() => seen.push(text)).pipe(Effect.andThen(real.remove(lock))),
                Effect.sync(() => raced && file === lock && seen.length === 0),
              ),
            ),
          ),
      });
      const store = yield* Effect.map(
        Layer.build(
          ContentStore.layer.pipe(Layer.provide(Layer.succeed(FileSystem.FileSystem, racing))),
        ),
        Context.get(ContentStore),
      );
      yield* store.update(shared, (m) => m);
      expect(seen.map((text) => text.includes('"third"'))).toEqual([true]);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('a live holder keeps its lock however long it holds it', () => {
    // Taken a minute ago by this very process, which still runs: a slow change, not a crash.
    const held = Schema.encodeSync(LockOwnerJson)({ pid: process.pid, created: 0, token: 'slow' });
    return Effect.gen(function* () {
      const files = new Map<string, Uint8Array>();
      const store = yield* storeOn(files);
      const lock = lockFile(assets.file);
      yield* TestClock.adjust('1 minute');
      files.set(lock, text(held));
      const refused = yield* waited(Effect.flip(store.update(assets, (m) => m)));
      expect(refused._tag).toBe('StoreLocked');
      expect(new TextDecoder().decode(files.get(lock))).toBe(held);
    }).pipe(Effect.scoped);
  });

  it.effect("a dead holder's lock is recovered; a holder on another host is never judged", () =>
    Effect.gen(function* () {
      const files = new Map<string, Uint8Array>();
      const store = yield* storeOn(files);
      const lock = lockFile(assets.file);
      const heldOn = (host: string) =>
        Schema.encodeSync(LockOwnerJson)({ pid: 4242, created: 0, token: 'gone', host });
      // No process on this host runs, as far as this probe says.
      const noneRunning = Effect.provideService(Processes, {
        host: 'here',
        alive: () => Effect.succeed(false),
      });
      // Pid 4242 on another host: whether it runs cannot be known from here.
      files.set(lock, text(heldOn('elsewhere')));
      const refused = yield* waited(Effect.flip(noneRunning(store.update(assets, (m) => m))));
      expect(refused._tag).toBe('StoreLocked');
      expect(new TextDecoder().decode(files.get(lock))).toBe(heldOn('elsewhere'));
      // Pid 4242 on this host, gone: its lock is broken and the change lands.
      files.set(lock, text(heldOn('here')));
      yield* waited(
        noneRunning(
          store.update(assets, (m) => ({
            assets: { ...m.assets, x: { hash: 'x', file: 'x.flac' } },
          })),
        ),
      );
      expect(files.has(lock)).toBe(false);
      expect(Object.keys((yield* store.read(assets)).assets)).toEqual(['x']);
    }).pipe(Effect.scoped),
  );

  test('a lock is stale only once its holder is gone; a running one holds however old, and another host is never judged', () => {
    const owner = { pid: 42, host: 'here', created: 1_000_000, token: 't' };
    const alive = () => true;
    const gone = () => false;
    const hourLater = 1_000_000 + 3_600_000;
    expect(lockVerdict(Option.some(owner), hourLater, 'here', alive)).toEqual(Option.none());
    expect(lockVerdict(Option.some(owner), 1_000_000 + 1_000, 'here', gone)).toEqual(
      Option.some('its holder, pid 42, is gone'),
    );
    expect(lockVerdict(Option.some(owner), hourLater, 'there', gone)).toEqual(Option.none());
    // A lock from before the host was written is judged as this host's.
    const { host: _, ...unnamed } = owner;
    expect(lockVerdict(Option.some(unnamed), hourLater, 'here', gone)).toEqual(
      Option.some('its holder, pid 42, is gone'),
    );
    // One whose holder cannot be read ages from its file's mtime.
    expect(lockVerdict(Option.none(), 1_000_000 + 29_000, 'here', gone, 1_000_000)).toEqual(
      Option.none(),
    );
    expect(lockVerdict(Option.none(), 1_000_000 + 31_000, 'here', gone, 1_000_000)).toEqual(
      Option.some('its holder cannot be read, and it was made 31 s ago'),
    );
  });
});
