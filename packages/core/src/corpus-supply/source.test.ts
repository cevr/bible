import { Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { PublicationArchive } from '../writings/archive.js';
import { Publication, publicationCode, publicationId } from '../writings/model.js';
import { CorpusContributionRejectedError, CorpusSourceUnavailableError } from './errors.js';
import { WritingsContribution, unknownProvenance } from './model.js';
import { makeWritingsAssetRecipe, type WritingsAssetSourceService } from './source.js';

const publication = Publication.make({
  id: publicationId(127),
  code: publicationCode('PP'),
  title: 'Patriarchs and Prophets',
  author: 'Ellen G. White',
  paragraphCount: Option.some(0),
});
const contribution = WritingsContribution.make({
  provenance: unknownProvenance('fixture', '1'),
  archive: PublicationArchive.make({ publication, paragraphs: [], bibleReferences: [] }),
});
const unavailable = (kind: WritingsAssetSourceService['kind']): WritingsAssetSourceService => ({
  kind,
  catalog: Effect.fail(CorpusSourceUnavailableError.make({ operation: kind, cause: 'offline' })),
  acquire: () =>
    Effect.fail(CorpusSourceUnavailableError.make({ operation: kind, cause: 'offline' })),
});

describe('Writings Asset Recipe', () => {
  it.effect('merges available catalogs in priority order without duplicating identities', () =>
    Effect.gen(function* () {
      const higher = Publication.make({
        id: publication.id,
        code: publication.code,
        title: 'Packaged title',
        author: publication.author,
        paragraphCount: publication.paragraphCount,
      });
      const another = Publication.make({
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
      const packaged: WritingsAssetSourceService = {
        ...unavailable('packaged'),
        acquire: () =>
          Effect.gen(function* () {
            attempts.push('packaged');
            return yield* CorpusSourceUnavailableError.make({
              operation: 'packaged',
              cause: 'absent',
            });
          }),
      };
      const provider: WritingsAssetSourceService = {
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
      const rejected: WritingsAssetSourceService = {
        ...unavailable('packaged'),
        acquire: (id) =>
          Effect.fail(CorpusContributionRejectedError.make({ publication: id, cause: 'invalid' })),
      };
      const fallback: WritingsAssetSourceService = {
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
