import { Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { PublicationArchive } from '../writings/archive.js';
import { Publication, publicationCode, publicationId } from '../writings/model.js';
import { CorpusContributionRejectedError, CorpusSourceUnavailableError } from './errors.js';
import { WritingsContribution, unknownProvenance } from './model.js';
import { makeWritingsAssetRecipe, type WritingsAssetSourceShape } from './source.js';

const publication = new Publication({
  id: publicationId(127),
  code: publicationCode('PP'),
  title: 'Patriarchs and Prophets',
  author: 'Ellen G. White',
  paragraphCount: Option.some(0),
});
const contribution = new WritingsContribution({
  provenance: unknownProvenance('fixture', '1'),
  archive: new PublicationArchive({ publication, paragraphs: [], bibleReferences: [] }),
});
const unavailable = (kind: WritingsAssetSourceShape['kind']): WritingsAssetSourceShape => ({
  kind,
  catalog: Effect.fail(new CorpusSourceUnavailableError({ operation: kind, cause: 'offline' })),
  acquire: () =>
    Effect.fail(new CorpusSourceUnavailableError({ operation: kind, cause: 'offline' })),
});

describe('Writings Asset Recipe', () => {
  it.effect('merges available catalogs in priority order without duplicating identities', () =>
    Effect.gen(function* () {
      const higher = new Publication({
        id: publication.id,
        code: publication.code,
        title: 'Packaged title',
        author: publication.author,
        paragraphCount: publication.paragraphCount,
      });
      const another = new Publication({
        id: publicationId(128),
        code: publicationCode('GC'),
        title: 'The Great Controversy',
        author: publication.author,
        paragraphCount: Option.none(),
      });
      const recipe = makeWritingsAssetRecipe([
        { ...unavailable('archive'), catalog: Effect.succeed([publication, another]) },
        { ...unavailable('packaged'), catalog: Effect.succeed([higher]) },
      ]);

      const catalog = yield* recipe.catalog;
      expect(catalog.map((item) => item.id)).toEqual([publication.id, another.id]);
      expect(catalog[0]?.title).toBe('Packaged title');
    }),
  );

  it.effect('owns priority and falls back only when a source is unavailable', () =>
    Effect.gen(function* () {
      const attempts: string[] = [];
      const packaged: WritingsAssetSourceShape = {
        ...unavailable('packaged'),
        acquire: () =>
          Effect.gen(function* () {
            attempts.push('packaged');
            return yield* new CorpusSourceUnavailableError({
              operation: 'packaged',
              cause: 'absent',
            });
          }),
      };
      const provider: WritingsAssetSourceShape = {
        ...unavailable('provider'),
        acquire: () =>
          Effect.sync(() => {
            attempts.push('provider');
            return contribution;
          }),
      };
      const recipe = makeWritingsAssetRecipe([provider, packaged]);

      expect(yield* recipe.acquire(publication.id)).toEqual(contribution);
      expect(attempts).toEqual(['packaged', 'provider']);
    }),
  );

  it.effect('fails closed on a rejected Contribution instead of trying another source', () =>
    Effect.gen(function* () {
      let fallbackAttempts = 0;
      const rejected: WritingsAssetSourceShape = {
        ...unavailable('packaged'),
        acquire: (id) =>
          Effect.fail(new CorpusContributionRejectedError({ publication: id, cause: 'invalid' })),
      };
      const fallback: WritingsAssetSourceShape = {
        ...unavailable('archive'),
        acquire: () =>
          Effect.sync(() => {
            fallbackAttempts += 1;
            return contribution;
          }),
      };
      const failure = yield* Effect.flip(
        makeWritingsAssetRecipe([fallback, rejected]).acquire(publication.id),
      );

      expect(failure._tag).toBe('CorpusContributionRejectedError');
      expect(fallbackAttempts).toBe(0);
    }),
  );
});
