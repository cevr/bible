// ProductionStore and `film publish`'s stamp: a ledger starts on its first
// change and lists by name; two moves forward from the same version, at
// once, land one and refuse the other with the version now; a ledger that
// does not decode is left out of the list and never rewritten, and so is one
// kept in a file not named for its production: a read or a change by that
// file's name fails, as a change that names another production does; the
// verbs refuse a second start and a filing in a version the ledger lacks; a
// set's review.json is stamped with its production, version and time, every
// other field as written, and a stamp that would make it no manifest is
// refused.

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
import { type OwnerWord, type ProductionFile, moveForward, withSaid } from '../core/production.ts';
import { VersionMoved } from '../core/refusals.ts';
import { ContentStore } from './content-store.ts';
import { FileInvalid } from './errors.ts';
import { ManifestLock } from './manifest-lock.ts';
import { ProductionStore } from './production-store.ts';
import { memoryFileSystem, memoryManifestLock } from './testing.ts';

const HOUR = 3_600_000;

const JsonText = Schema.fromJsonString(Schema.JsonObject);

/** A store over files kept in `files`, the ledgers under `/productions`. */
const storeOver = (files: Map<string, Uint8Array>) =>
  ProductionStore.layer.pipe(
    Layer.provide(ContentStore.layer),
    Layer.provide([
      memoryFileSystem(files),
      Path.layer,
      ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_PRODUCTIONS: '/productions' })),
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
            ask: Option.none(),
            picks: Option.none(),
            by: Option.none(),
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
      yield* fs.makeDirectory('/productions', { recursive: true });
      yield* fs.writeFileString('/productions/broken.json', '{"production": 4}');
      const store = yield* ProductionStore;
      yield* store.modify('look', forward(1, 'K1'));
      expect((yield* store.list).map((p) => p.production)).toEqual(['look']);
      expect(yield* fs.readFileString('/productions/broken.json')).toBe('{"production": 4}');
    }).pipe(Effect.provide(Layer.merge(storeOver(files), memoryFileSystem(files))));
  });

  it.effect(
    'a ledger kept in a file not named for its production is left out of the list, refused by that name, never rewritten',
    () => {
      const files = new Map<string, Uint8Array>();
      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const store = yield* ProductionStore;
        yield* store.modify('renamed', forward(1, 'K1'));
        yield* fs.rename('/productions/renamed.json', '/productions/old-name.json');
        const kept = yield* fs.readFileString('/productions/old-name.json');
        yield* store.modify('look', forward(1, 'K1'));
        expect((yield* store.list).map((p) => p.production)).toEqual(['look']);
        // By its file's name, a read and a change that would land are refused as a ledger
        // that does not decode is.
        const read = yield* Effect.flip(store.read('old-name'));
        const changed = yield* Effect.flip(store.modify('old-name', forward(2, 'K2')));
        for (const refused of [read, changed]) {
          expect(refused).toBeInstanceOf(FileInvalid);
          expect(refused.message).toContain(
            'it holds the production renamed, not old-name, the one its file is named for',
          );
        }
        expect(yield* fs.readFileString('/productions/old-name.json')).toBe(kept);
        expect(yield* fs.exists('/productions/renamed.json')).toBe(false);
      }).pipe(Effect.provide(Layer.merge(storeOver(files), memoryFileSystem(files))));
    },
  );

  it.effect('a change that names another production is refused, and its file is as it was', () => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const store = yield* ProductionStore;
      yield* store.modify('look', forward(1, 'K1'));
      const kept = yield* fs.readFileString('/productions/look.json');
      const refused = yield* Effect.flip(
        store.modify('look', (current) => Result.succeed({ ...current, production: 'other' })),
      );
      expect(refused).toBeInstanceOf(FileInvalid);
      expect(refused.message).toContain(
        'it holds the production other, not look, the one its file is named for',
      );
      expect(yield* fs.readFileString('/productions/look.json')).toBe(kept);
      expect(yield* fs.exists('/productions/other.json')).toBe(false);
    }).pipe(Effect.provide(Layer.merge(storeOver(files), memoryFileSystem(files))));
  });
});

describe('the verbs', () => {
  it.effect('start refuses a production that already has a ledger', () =>
    Effect.gen(function* () {
      const store = yield* ProductionStore;
      const start = {
        title: 'The look',
        film: Option.none(),
        blurb: Option.none(),
        first: 'Paper-cut knobs',
        at: HOUR,
      };
      const file = yield* store.start('look', start);
      expect(file.versions.map((v) => v.title)).toEqual(['Paper-cut knobs']);
      const again = yield* Effect.exit(store.start('look', start));
      expect(Exit.isFailure(again)).toBe(true);
    }).pipe(Effect.provide(storeOver(new Map()))),
  );

  it.effect('say refuses a choice with no set, and a variant with no choice', () =>
    Effect.gen(function* () {
      const store = yield* ProductionStore;
      const word: OwnerWord = {
        _tag: 'Decided',
        at: HOUR,
        text: 'K1',
        quote: Option.none(),
        set: Option.none(),
        point: Option.none(),
        variant: Option.none(),
        ask: Option.none(),
        picks: Option.none(),
        by: Option.none(),
      };
      const refusal = (said: OwnerWord) =>
        Effect.flip(store.say('look', said)).pipe(Effect.map((e) => e.message));
      expect(yield* refusal({ ...word, point: Option.some('render:cold') })).toBe(
        '`point` is a choice in a set: name the `set`',
      );
      expect(yield* refusal({ ...word, variant: Option.some('k1') })).toBe(
        "`variant` is one of a choice's: name the `point`",
      );
      expect(yield* store.read('look')).toEqual(Option.none());
    }).pipe(Effect.provide(storeOver(new Map()))),
  );

  it.effect('a filing must name a version the ledger has', () =>
    Effect.gen(function* () {
      const store = yield* ProductionStore;
      const said = yield* store.say('look', {
        _tag: 'Noted',
        at: HOUR,
        text: 'Warmer paper',
        quote: Option.none(),
        set: Option.none(),
        point: Option.none(),
        variant: Option.none(),
        ask: Option.none(),
        picks: Option.none(),
        by: Option.none(),
      });
      expect(said.said.map((s) => s._tag)).toEqual(['Noted']);
      expect(Exit.isFailure(yield* Effect.exit(store.file('look', 'styles', 2)))).toBe(true);
      expect((yield* store.file('look', 'styles', 1)).filed).toEqual([
        { set: 'styles', version: 1 },
      ]);
    }).pipe(Effect.provide(storeOver(new Map()))),
  );
});

describe('film publish: the stamp', () => {
  const manifest = Schema.encodeSync(JsonText)({
    title: 'Styles',
    images: ['a.png'],
    extra: { kept: true },
    version: 2,
  });

  /** Publish `/out/styles` holding `text` as its review.json; the review.json after, decoded. */
  const published = (text: string, version: Option.Option<number>) => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory('/out/styles', { recursive: true });
      yield* fs.writeFileString('/out/styles/review.json', text);
      yield* (yield* ProductionStore).publish('/out/styles', 'look', version, 5 * HOUR);
      return yield* fs.readFileString('/out/styles/review.json');
    }).pipe(Effect.provide(Layer.merge(storeOver(files), memoryFileSystem(files))));
  };

  it.effect('stamps the production and time, every other field kept, a dropped version gone', () =>
    Effect.gen(function* () {
      const text = yield* published(manifest, Option.none());
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
      const text = yield* published(manifest, Option.some(3));
      expect((yield* Schema.decodeEffect(JsonText)(text))['version']).toBe(3);
    }),
  );

  it.effect('refuses text that is no manifest', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(published('{"images": 4}', Option.none()));
      expect(Exit.isFailure(exit)).toBe(true);
    }),
  );
});
