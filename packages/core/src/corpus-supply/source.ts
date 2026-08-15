import { Context, Effect, Layer, Option, Result } from 'effect';

import type { Publication, PublicationId } from '../writings/model.js';
import type { CorpusContributionRejectedError, CorpusSourceUnavailableError } from './errors.js';
import type { WritingsContribution } from './model.js';

export type WritingsAssetSourceKind = 'packaged' | 'provider' | 'archive';

export interface WritingsAssetSourceService {
  readonly kind: WritingsAssetSourceKind;
  readonly catalog: Effect.Effect<readonly Publication[], CorpusSourceUnavailableError>;
  readonly acquire: (
    publication: PublicationId,
  ) => Effect.Effect<
    WritingsContribution,
    CorpusSourceUnavailableError | CorpusContributionRejectedError
  >;
}

export type WritingsAssetSources = readonly [
  WritingsAssetSourceService,
  ...WritingsAssetSourceService[],
];

export interface WritingsAssetRecipeService {
  readonly catalog: Effect.Effect<readonly Publication[], CorpusSourceUnavailableError>;
  readonly acquire: WritingsAssetSourceService['acquire'];
}

export class WritingsAssetRecipe extends Context.Service<
  WritingsAssetRecipe,
  WritingsAssetRecipeService
>()('@bible/core/corpus-supply/WritingsAssetRecipe') {}

const sourcePriority = {
  packaged: 0,
  provider: 1,
  archive: 2,
} satisfies Readonly<Record<WritingsAssetSourceKind, number>>;

const ordered = (sources: readonly WritingsAssetSourceService[]) =>
  [...sources].sort((left, right) => sourcePriority[left.kind] - sourcePriority[right.kind]);

const mergedCatalog = (
  sources: readonly WritingsAssetSourceService[],
): Effect.Effect<readonly Publication[], CorpusSourceUnavailableError> =>
  Effect.gen(function* () {
    const publications = new Map<PublicationId, Publication>();
    let unavailable = Option.none<CorpusSourceUnavailableError>();
    for (const source of sources) {
      const result = yield* Effect.result(source.catalog);
      if (Result.isFailure(result)) {
        unavailable = Option.some(result.failure);
        continue;
      }
      for (const publication of result.success) {
        if (!publications.has(publication.id)) publications.set(publication.id, publication);
      }
    }
    if (publications.size > 0) return [...publications.values()];
    if (Option.isSome(unavailable)) return yield* unavailable.value;
    return [];
  });

export const makeWritingsAssetRecipe = (
  sources: WritingsAssetSources,
): WritingsAssetRecipeService => {
  const recipe = ordered(sources);
  return WritingsAssetRecipe.of({
    catalog: mergedCatalog(recipe),
    acquire: (publication) =>
      Effect.gen(function* () {
        let unavailable = Option.none<CorpusSourceUnavailableError>();
        for (const source of recipe) {
          const result = yield* Effect.result(source.acquire(publication));
          if (Result.isSuccess(result)) return result.success;
          if (result.failure._tag === 'CorpusContributionRejectedError') {
            return yield* result.failure;
          }
          unavailable = Option.some(result.failure);
        }
        if (Option.isSome(unavailable)) return yield* unavailable.value;
        return yield* Effect.die('Writings Asset Recipe requires at least one source');
      }),
  });
};

export const layerWritingsAssetRecipe = (
  sources: WritingsAssetSources,
): Layer.Layer<WritingsAssetRecipe> =>
  Layer.succeed(WritingsAssetRecipe, makeWritingsAssetRecipe(sources));

export const layerWritingsAssetSource = (
  source: WritingsAssetSourceService,
): Layer.Layer<WritingsAssetRecipe> => layerWritingsAssetRecipe([source]);
