// ContentStore: updates finishing together all land, and a current hash skips
// the work.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option, Schema } from 'effect';
import { Asset, type SoundManifest, SoundManifestJson } from '../core/schema.ts';
import { ContentStore, type Manifest } from './content-store.ts';
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
});
