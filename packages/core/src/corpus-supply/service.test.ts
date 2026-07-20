import { describe, expect, test } from 'bun:test';
import { Effect, Layer, Option, Result, Stream } from 'effect';

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
import { CorpusSupply } from './service.js';
import { Target, WritingsContribution, unknownProvenance } from './model.js';
import { WritingsAssetRecipe } from './source.js';
import { layerBibleArtifactInstaller, layerBibleArtifactRecipe } from './bible-artifact.js';

const id = publicationId(127);
const code = publicationCode('PP');
const publication = new Publication({
  id,
  code,
  title: 'Patriarchs and Prophets',
  author: 'Ellen G. White',
  paragraphCount: Option.some(1),
});
const archive = new PublicationArchive({
  publication,
  paragraphs: [
    new ArchivedParagraph({
      refcode: 'PP 1.1',
      paragraph: new Paragraph({
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
const contribution = new WritingsContribution({
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
  const recipe = layerBibleArtifactRecipe([
    {
      kind: 'release',
      acquire: Effect.succeed({
        kind: 'release',
        provenance: contribution.provenance,
        bytes: Stream.empty,
      }),
    },
  ]);
  const installer = layerBibleArtifactInstaller({
    current: Effect.succeed(Option.none()),
    install: (artifact) => Effect.succeed({ installed: 31_102, provenance: artifact.provenance }),
  });
  return CorpusSupply.layer.pipe(
    Layer.provide(Layer.mergeAll(database, source, recipe, installer)),
  );
};

describe('CorpusSupply', () => {
  test('treats omitted and explicit empty inputs as the same Bootstrap request', async () => {
    const layer = makeLayer({ needsSync: true });
    const [omitted, empty] = await Effect.runPromise(
      Effect.gen(function* () {
        const supply = yield* CorpusSupply;
        return [yield* supply.ensure(), yield* supply.ensure({})] as const;
      }).pipe(Effect.provide(layer)),
    );

    expect(empty).toEqual(omitted);
    expect(omitted.activated).toHaveLength(1);
    expect(omitted.activated[0]?.corpus).toBe('bible');
    expect(omitted.skipped).toEqual([]);
  });

  test('revalidates installed Provenance and skips an identical Contribution', async () => {
    let catalogCalls = 0;
    let acquireCalls = 0;
    const layer = makeLayer({
      needsSync: false,
      onCatalog: () => catalogCalls++,
      onAcquire: () => acquireCalls++,
    });
    const [current, refreshed] = await Effect.runPromise(
      Effect.gen(function* () {
        const supply = yield* CorpusSupply;
        const target = Target.writings([id]);
        return [
          yield* supply.ensure({ target }),
          yield* supply.ensure({ target, refresh: true }),
        ] as const;
      }).pipe(Effect.provide(layer)),
    );

    expect(current.skipped).toEqual([id]);
    expect(refreshed.skipped).toEqual([id]);
    expect(catalogCalls).toBe(0);
    expect(acquireCalls).toBe(2);
  });

  test('reports an unavailable recipe instead of partially bootstrapping Bible assets', async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const supply = yield* CorpusSupply;
        return yield* Effect.result(supply.ensure({ target: Target.bible() }));
      }).pipe(Effect.provide(makeLayer({ needsSync: true, includeBible: false }))),
    );

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) expect(result.failure._tag).toBe('CorpusRecipeUnavailableError');
  });
});
