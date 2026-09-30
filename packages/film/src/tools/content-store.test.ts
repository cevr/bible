// ContentStore: updates finishing together all land, in one process or two,
// and a current hash skips the work.

import { BunServices } from '@effect/platform-bun';
import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Context, Effect, FileSystem, Layer, Option, Schema } from 'effect';
import { Asset, type SoundManifest, SoundManifestJson } from '../core/schema.ts';
import { ContentStore, type Manifest, lockVerdict } from './content-store.ts';
import { storeLayer } from './testing.ts';

const manifest: Manifest<SoundManifest> = {
  file: '/films/test/sound/manifest.json',
  codec: SoundManifestJson,
  empty: {},
};

/** A manifest of many keyed assets, so racing updates each add their own. */
const Assets = Schema.Struct({ assets: Schema.Record(Schema.String, Asset) });
const assets: Manifest<typeof Assets.Type> = {
  file: '/films/test/assets.json',
  codec: Schema.fromJsonString(Assets),
  empty: { assets: {} },
};

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

  test('a lock is stale when its holder is gone or it is past 30 s; a live, fresh one holds', () => {
    const owner = { pid: 42, created: 1_000_000, token: 't' };
    const alive = () => true;
    expect(lockVerdict(Option.some(owner), 1_000_000 + 29_000, alive)).toEqual(Option.none());
    expect(lockVerdict(Option.some(owner), 1_000_000 + 1_000, () => false)).toEqual(
      Option.some('its holder, pid 42, is gone'),
    );
    expect(lockVerdict(Option.some(owner), 1_000_000 + 31_000, alive)).toEqual(
      Option.some('it was taken 31 s ago'),
    );
  });
});
