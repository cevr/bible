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
  const recipe = BibleArtifact.layerRecipe({
    sources: [
      {
        kind: 'release',
        acquire: Effect.succeed({
          kind: 'release',
          provenance: contribution.provenance,
          expectedSize: Option.none(),
          bytes: Stream.empty,
        }),
      },
    ],
  });
  const installer = BibleArtifact.layerInstaller({
    current: Effect.succeed(Option.none()),
    activeFile: Effect.succeedNone,
    install: (artifact) => Effect.succeed({ installed: 31_102, provenance: artifact.provenance }),
  });
  return CorpusSupply.layer.pipe(
    Layer.provide(Layer.mergeAll(database, source, recipe, installer)),
  );
};

describe('CorpusSupply', () => {
  it.effect('treats omitted and explicit empty inputs as the same Bootstrap request', () =>
    Effect.gen(function* () {
      const supply = yield* CorpusSupply;
      const [omitted, empty] = [yield* supply.ensure(), yield* supply.ensure({})];

      expect(empty).toEqual(omitted);
      expect(omitted.activated).toHaveLength(1);
      expect(omitted.activated[0]?.corpus).toBe('bible');
      expect(omitted.skipped).toEqual([]);
    }).pipe(Effect.provide(makeLayer({ needsSync: true }))),
  );

  // Declared beside the test rather than inside its generator so the layer that
  // counts through them is built at the test's own boundary, where the provide
  // belongs. The assertions still read them.
  let catalogCalls = 0;
  let acquireCalls = 0;

  it.effect('revalidates installed Provenance and skips an identical Contribution', () =>
    Effect.gen(function* () {
      const supply = yield* CorpusSupply;
      const target = Target.writings([id]);
      const [current, refreshed] = [
        yield* supply.ensure({ target }),
        yield* supply.ensure({ target, refresh: true }),
      ];

      expect(current.skipped).toEqual([id]);
      expect(refreshed.skipped).toEqual([id]);
      expect(catalogCalls).toBe(0);
      expect(acquireCalls).toBe(2);
    }).pipe(
      Effect.provide(
        makeLayer({
          needsSync: false,
          onCatalog: () => catalogCalls++,
          onAcquire: () => acquireCalls++,
        }),
      ),
    ),
  );

  it.effect('reports an unavailable recipe instead of partially bootstrapping Bible assets', () =>
    Effect.gen(function* () {
      const supply = yield* CorpusSupply;
      const failure = yield* Effect.flip(supply.ensure({ target: Target.bible() }));

      expect(failure._tag).toBe('CorpusRecipeUnavailableError');
    }).pipe(Effect.provide(makeLayer({ needsSync: true, includeBible: false }))),
  );

  it.effect('routes Bootstrap and an addressed File Corpus through the same registry', () =>
    Effect.gen(function* () {
      const supply = yield* CorpusSupply;
      const [bootstrapped, addressed] = [
        yield* supply.ensure({ target: Target.bootstrap() }),
        yield* supply.ensure({ target: Target.file('bible') }),
      ];

      expect(addressed).toEqual(bootstrapped);
      expect(addressed.activated).toMatchObject([{ corpus: 'bible', identity: 'canonical' }]);
    }).pipe(Effect.provide(makeLayer({ needsSync: true }))),
  );

  it.effect('names the addressed File Corpus when no host wires its Recipe', () =>
    Effect.gen(function* () {
      const supply = yield* CorpusSupply;
      const failure = yield* Effect.flip(supply.ensure({ target: Target.file('bible') }));

      expect(failure).toMatchObject({ _tag: 'CorpusRecipeUnavailableError', corpus: 'bible' });
    }).pipe(Effect.provide(makeLayer({ needsSync: true, includeBible: false }))),
  );

  /** A wired recipe whose every source refuses to acquire — an offline host, or
   *  one whose only source is a release with no published artifact yet. */
  const offline = (current: Option.Option<CorpusProvenance>) => {
    const recipe = BibleArtifact.layerRecipe({
      sources: [
        {
          kind: 'release',
          acquire: CorpusSourceUnavailableError.make({
            operation: 'fetch-bible-release',
            cause: 'offline',
          }),
        },
      ],
    });
    const installer = BibleArtifact.layerInstaller({
      current: Effect.succeed(current),
      activeFile: Effect.succeedNone,
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
      const supply = yield* CorpusSupply;
      const receipt = yield* supply.ensure({ target: Target.file('bible') });

      expect(receipt.activated).toEqual([]);
      expect(receipt.skipped).toEqual(['canonical']);
    }).pipe(Effect.provide(offline(Option.some(contribution.provenance)))),
  );

  it.effect('still fails when nothing is installed and no source can be acquired', () =>
    Effect.gen(function* () {
      // Bible is fail-closed at startup. With no active artifact there is
      // nothing to fall back to, so the acquisition failure must still surface.
      const supply = yield* CorpusSupply;
      const failure = yield* Effect.flip(supply.ensure({ target: Target.file('bible') }));

      expect(failure._tag).toBe('CorpusSourceUnavailableError');
    }).pipe(Effect.provide(offline(Option.none()))),
  );
});
