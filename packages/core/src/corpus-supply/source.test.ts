import { describe, expect, test } from 'bun:test';
import { Effect, Option, Result } from 'effect';

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
  test('owns priority and falls back only when a source is unavailable', async () => {
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

    expect(await Effect.runPromise(recipe.acquire(publication.id))).toEqual(contribution);
    expect(attempts).toEqual(['packaged', 'provider']);
  });

  test('fails closed on a rejected Contribution instead of trying another source', async () => {
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
    const result = await Effect.runPromise(
      Effect.result(makeWritingsAssetRecipe([fallback, rejected]).acquire(publication.id)),
    );

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result))
      expect(result.failure._tag).toBe('CorpusContributionRejectedError');
    expect(fallbackAttempts).toBe(0);
  });
});
