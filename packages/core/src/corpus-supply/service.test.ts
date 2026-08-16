import { Effect, Layer, Option, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import { ArchivedParagraph, PublicationArchive } from '../writings/archive.js';
import {
  Paragraph,
  Publication,
  Reference,
  publicationCode,
  publicationId,
  publicationOrder,
} from '../writings/model.js';
import { CorpusSourceUnavailableError } from './errors.js';
import { CorpusSupply } from './service.js';
import { Target, WritingsContribution, unknownProvenance, type CorpusProvenance } from './model.js';
import { WritingsAssetRecipe } from './source.js';
import { BibleArtifact } from './file-artifact.js';

const id = publicationId(127);
const code = publicationCode('PP');
const publication = Publication.make({
  id,
  code,
  title: 'Patriarchs and Prophets',
  author: 'Ellen G. White',
  paragraphCount: Option.some(1),
});
const archive = PublicationArchive.make({
  publication,
  paragraphs: [
    ArchivedParagraph.make({
      refcode: 'PP 1.1',
      paragraph: Paragraph.make({
        reference: Reference.paragraph(id, 'pp-1-1'),
        publicationCode: code,
        order: publicationOrder(1),
        page: Option.none(),
        number: Option.none(),
        refcode: Option.some('PP 1.1'),
        nodes: [{ _tag: 'Text', text: 'In the beginning' }],
        elementType: Option.none(),
        elementSubtype: Option.none(),
      }),
      isHeading: false,
    }),
  ],
  bibleReferences: [],
});
const contribution = WritingsContribution.make({
  provenance: unknownProvenance('egw-api', '2026-07-20'),
  archive,
});

const makeLayer = (options: {
  readonly needsSync: boolean;
  readonly includeBible?: boolean;
  readonly onCatalog?: () => void;
  readonly onAcquire?: () => void;
}) => {
  const database = EGWParagraphDatabase.Test({ needsSync: () => options.needsSync });
  const source = Layer.succeed(
    WritingsAssetRecipe,
    WritingsAssetRecipe.of({
      catalog: Effect.sync(() => {
        options.onCatalog?.();
        return [publication];
      }),
      acquire: () =>
        Effect.sync(() => {
          options.onAcquire?.();
          return contribution;
        }),
    }),
  );
  if (options.includeBible === false) {
    return CorpusSupply.layer.pipe(Layer.provide(Layer.merge(database, source)));
  }
  const recipe = BibleArtifact.layerRecipe([
    {
      kind: 'release',
      acquire: Effect.succeed({
        kind: 'release',
        provenance: contribution.provenance,
        expectedSize: Option.none(),
        bytes: Stream.empty,
      }),
    },
  ]);
  const installer = BibleArtifact.layerInstaller({
    current: Effect.succeed(Option.none()),
    install: (artifact) => Effect.succeed({ installed: 31_102, provenance: artifact.provenance }),
  });
  return CorpusSupply.layer.pipe(
    Layer.provide(Layer.mergeAll(database, source, recipe, installer)),
  );
};

describe('CorpusSupply', () => {
  it.effect('treats omitted and explicit empty inputs as the same Bootstrap request', () =>
    Effect.gen(function* () {
      const layer = makeLayer({ needsSync: true });
      const [omitted, empty] = yield* Effect.gen(function* () {
        const supply = yield* CorpusSupply;
        return [yield* supply.ensure(), yield* supply.ensure({})] as const;
      }).pipe(Effect.provide(layer));

      expect(empty).toEqual(omitted);
      expect(omitted.activated).toHaveLength(1);
      expect(omitted.activated[0]?.corpus).toBe('bible');
      expect(omitted.skipped).toEqual([]);
    }),
  );

  it.effect('revalidates installed Provenance and skips an identical Contribution', () =>
    Effect.gen(function* () {
      let catalogCalls = 0;
      let acquireCalls = 0;
      const layer = makeLayer({
        needsSync: false,
        onCatalog: () => catalogCalls++,
        onAcquire: () => acquireCalls++,
      });
      const [current, refreshed] = yield* Effect.gen(function* () {
        const supply = yield* CorpusSupply;
        const target = Target.writings([id]);
        return [
          yield* supply.ensure({ target }),
          yield* supply.ensure({ target, refresh: true }),
        ] as const;
      }).pipe(Effect.provide(layer));

      expect(current.skipped).toEqual([id]);
      expect(refreshed.skipped).toEqual([id]);
      expect(catalogCalls).toBe(0);
      expect(acquireCalls).toBe(2);
    }),
  );

  it.effect('reports an unavailable recipe instead of partially bootstrapping Bible assets', () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        Effect.gen(function* () {
          const supply = yield* CorpusSupply;
          return yield* supply.ensure({ target: Target.bible() });
        }).pipe(Effect.provide(makeLayer({ needsSync: true, includeBible: false }))),
      );

      expect(failure._tag).toBe('CorpusRecipeUnavailableError');
    }),
  );

  it.effect('routes Bootstrap and an addressed File Corpus through the same registry', () =>
    Effect.gen(function* () {
      const layer = makeLayer({ needsSync: true });
      const [bootstrapped, addressed] = yield* Effect.gen(function* () {
        const supply = yield* CorpusSupply;
        return [
          yield* supply.ensure({ target: Target.bootstrap() }),
          yield* supply.ensure({ target: Target.file('bible') }),
        ] as const;
      }).pipe(Effect.provide(layer));

      expect(addressed).toEqual(bootstrapped);
      expect(addressed.activated).toMatchObject([{ corpus: 'bible', identity: 'canonical' }]);
    }),
  );

  it.effect('names the addressed File Corpus when no host wires its Recipe', () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        Effect.gen(function* () {
          const supply = yield* CorpusSupply;
          return yield* supply.ensure({ target: Target.file('bible') });
        }).pipe(Effect.provide(makeLayer({ needsSync: true, includeBible: false }))),
      );

      expect(failure).toMatchObject({ _tag: 'CorpusRecipeUnavailableError', corpus: 'bible' });
    }),
  );

  /** A wired recipe whose every source refuses to acquire — an offline host, or
   *  one whose only source is a release with no published artifact yet. */
  const offline = (current: Option.Option<CorpusProvenance>) => {
    const recipe = BibleArtifact.layerRecipe([
      {
        kind: 'release',
        acquire: CorpusSourceUnavailableError.make({
          operation: 'fetch-bible-release',
          cause: 'offline',
        }),
      },
    ]);
    const installer = BibleArtifact.layerInstaller({
      current: Effect.succeed(current),
      install: (artifact) => Effect.succeed({ installed: 31_102, provenance: artifact.provenance }),
    });
    return CorpusSupply.layer.pipe(Layer.provide(Layer.merge(recipe, installer)));
  };

  it.effect('keeps a verified active artifact when no source can be acquired', () =>
    Effect.gen(function* () {
      // The stale-fallback state (§3.5): the installed file passed digest and
      // semantic verification before activation, so an offline host keeps
      // serving it. Reporting an error here made hosts warn about a corpus that
      // was working perfectly.
      const receipt = yield* Effect.gen(function* () {
        const supply = yield* CorpusSupply;
        return yield* supply.ensure({ target: Target.file('bible') });
      }).pipe(Effect.provide(offline(Option.some(contribution.provenance))));

      expect(receipt.activated).toEqual([]);
      expect(receipt.skipped).toEqual(['canonical']);
    }),
  );

  it.effect('still fails when nothing is installed and no source can be acquired', () =>
    Effect.gen(function* () {
      // Bible is fail-closed at startup. With no active artifact there is
      // nothing to fall back to, so the acquisition failure must still surface.
      const failure = yield* Effect.flip(
        Effect.gen(function* () {
          const supply = yield* CorpusSupply;
          return yield* supply.ensure({ target: Target.file('bible') });
        }).pipe(Effect.provide(offline(Option.none()))),
      );

      expect(failure._tag).toBe('CorpusSourceUnavailableError');
    }),
  );
});
