// ProductionStore and `film publish`'s stamp: a ledger starts on its first
// change and lists by name; two moves forward from the same version, at
// once, land one and refuse the other with the version now; a ledger that
// does not decode is left out of the list and never rewritten; a set's
// review.json is stamped with its production, version and time, every other
// field as written, and a stamp that would make it no manifest is refused.

import { describe, expect, it } from 'effect-bun-test';
import {
  ConfigProvider,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Path,
  Result,
  Schema,
} from 'effect';
import { type ProductionFile, moveForward, withSaid } from '../core/production.ts';
import { VersionMoved } from '../core/refusals.ts';
import { ContentStore } from './content-store.ts';
import { ManifestLock } from './manifest-lock.ts';
import { ProductionStore, stampManifest } from './production-store.ts';
import { memoryFileSystem, memoryManifestLock } from './testing.ts';

const HOUR = 3_600_000;

const JsonText = Schema.fromJsonString(Schema.JsonObject);

/** A store over files kept in `files`, the ledgers under `/lab/productions`. */
const storeOver = (files: Map<string, Uint8Array>) =>
  ProductionStore.layer.pipe(
    Layer.provide(ContentStore.layer),
    Layer.provide([
      memoryFileSystem(files),
      Path.layer,
      ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_LAB: '/lab' })),
      Layer.succeed(ManifestLock, memoryManifestLock()),
    ]),
  );

const forward = (after: number, title: string) => (current: ProductionFile) =>
  moveForward(current, { after, title, because: Option.none() }, 2 * HOUR);

describe('ProductionStore', () => {
  it.effect('a ledger starts on its first change and is listed by name', () =>
    Effect.gen(function* () {
      const store = yield* ProductionStore;
      expect(yield* store.list).toEqual([]);
      expect(Option.isNone(yield* store.read('look'))).toBe(true);
      yield* store.modify('look', (current) =>
        Result.succeed(
          withSaid(current, {
            _tag: 'Noted',
            at: HOUR,
            text: 'try seven styles',
            quote: Option.none(),
            set: Option.none(),
            point: Option.none(),
            variant: Option.none(),
          }),
        ),
      );
      yield* store.modify('look', forward(1, 'K1'));
      const listed = yield* store.list;
      expect(listed.map((p) => p.production)).toEqual(['look']);
      expect(listed[0]?.versions.map((v) => v.title)).toEqual(['v1', 'K1']);
      expect(listed[0]?.said.map((s) => s.text)).toEqual(['try seven styles']);
    }).pipe(Effect.provide(storeOver(new Map()))),
  );

  it.effect('two moves from the same version at once: one lands, the other is refused', () =>
    Effect.gen(function* () {
      const store = yield* ProductionStore;
      const moves = yield* Effect.forEach(
        ['K1', 'seven styles'],
        (title) => Effect.exit(store.modify('look', forward(1, title))),
        { concurrency: 2 },
      );
      expect(moves.filter(Exit.isSuccess)).toHaveLength(1);
      const failures = moves.filter(Exit.isFailure).map((exit) => Exit.findErrorOption(exit));
      expect(failures).toHaveLength(1);
      expect(Option.getOrThrow(failures[0] ?? Option.none())).toBeInstanceOf(VersionMoved);
      const file = Option.getOrThrow(yield* store.read('look'));
      expect(file.versions).toHaveLength(2);
    }).pipe(Effect.provide(storeOver(new Map()))),
  );

  it.effect('a ledger that does not decode is left out of the list, never rewritten', () => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory('/lab/productions', { recursive: true });
      yield* fs.writeFileString('/lab/productions/broken.json', '{"production": 4}');
      const store = yield* ProductionStore;
      yield* store.modify('look', forward(1, 'K1'));
      expect((yield* store.list).map((p) => p.production)).toEqual(['look']);
      expect(yield* fs.readFileString('/lab/productions/broken.json')).toBe('{"production": 4}');
    }).pipe(Effect.provide(Layer.merge(storeOver(files), memoryFileSystem(files))));
  });
});

describe('film publish: the stamp', () => {
  const manifest = Schema.encodeSync(JsonText)({
    title: 'Styles',
    images: ['a.png'],
    extra: { kept: true },
    version: 2,
  });

  it.effect('stamps the production and time, every other field kept, a dropped version gone', () =>
    Effect.gen(function* () {
      const text = yield* stampManifest('review.json', manifest, {
        production: 'look',
        version: Option.none(),
        published: 5 * HOUR,
      });
      expect(yield* Schema.decodeEffect(JsonText)(text)).toEqual({
        title: 'Styles',
        images: ['a.png'],
        extra: { kept: true },
        production: 'look',
        published: 5 * HOUR,
      });
      expect(text.endsWith('\n')).toBe(true);
    }),
  );

  it.effect('names the version given', () =>
    Effect.gen(function* () {
      const text = yield* stampManifest('review.json', manifest, {
        production: 'look',
        version: Option.some(3),
        published: 0,
      });
      expect((yield* Schema.decodeEffect(JsonText)(text))['version']).toBe(3);
    }),
  );

  it.effect('refuses text that is no manifest', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        stampManifest('review.json', '{"images": 4}', {
          production: 'look',
          version: Option.none(),
          published: 0,
        }),
      );
      expect(Exit.isFailure(exit)).toBe(true);
    }),
  );
});
