import { Context, Effect, Layer, Result } from 'effect';

import type { Publication, PublicationId } from '../writings/model.js';
import type { CorpusContributionRejectedError, CorpusSourceUnavailableError } from './errors.js';
import type { WritingsContribution } from './model.js';

export type WritingsAssetSourceKind = 'packaged' | 'provider' | 'archive';

export interface WritingsAssetSourceShape {
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
  WritingsAssetSourceShape,
  ...WritingsAssetSourceShape[],
];

export interface WritingsAssetRecipeShape {
  readonly catalog: Effect.Effect<readonly Publication[], CorpusSourceUnavailableError>;
  readonly acquire: WritingsAssetSourceShape['acquire'];
}

export class WritingsAssetRecipe extends Context.Service<
  WritingsAssetRecipe,
  WritingsAssetRecipeShape
>()('@bible/core/corpus-supply/WritingsAssetRecipe') {}

const sourcePriority: Readonly<Record<WritingsAssetSourceKind, number>> = {
  packaged: 0,
  provider: 1,
  archive: 2,
};

const ordered = (sources: readonly WritingsAssetSourceShape[]) =>
  [...sources].sort((left, right) => sourcePriority[left.kind] - sourcePriority[right.kind]);

const firstAvailable = <A>(
  sources: readonly WritingsAssetSourceShape[],
  operation: (source: WritingsAssetSourceShape) => Effect.Effect<A, CorpusSourceUnavailableError>,
): Effect.Effect<A, CorpusSourceUnavailableError> =>
  Effect.gen(function* () {
    let unavailable: CorpusSourceUnavailableError | undefined;
    for (const source of sources) {
      const result = yield* Effect.result(operation(source));
      if (Result.isSuccess(result)) return result.success;
      unavailable = result.failure;
    }
    if (unavailable !== undefined) return yield* unavailable;
    return yield* Effect.die('Writings Asset Recipe requires at least one source');
  });

export const makeWritingsAssetRecipe = (
  sources: WritingsAssetSources,
): WritingsAssetRecipeShape => {
  const recipe = ordered(sources);
  return WritingsAssetRecipe.of({
    catalog: firstAvailable(recipe, (source) => source.catalog),
    acquire: (publication) =>
      Effect.gen(function* () {
        let unavailable: CorpusSourceUnavailableError | undefined;
        for (const source of recipe) {
          const result = yield* Effect.result(source.acquire(publication));
          if (Result.isSuccess(result)) return result.success;
          if (result.failure._tag === 'CorpusContributionRejectedError') {
            return yield* result.failure;
          }
          unavailable = result.failure;
        }
        if (unavailable !== undefined) return yield* unavailable;
        return yield* Effect.die('Writings Asset Recipe requires at least one source');
      }),
  });
};

export const layerWritingsAssetRecipe = (
  sources: WritingsAssetSources,
): Layer.Layer<WritingsAssetRecipe> =>
  Layer.succeed(WritingsAssetRecipe, makeWritingsAssetRecipe(sources));

export const layerWritingsAssetSource = (
  source: WritingsAssetSourceShape,
): Layer.Layer<WritingsAssetRecipe> => layerWritingsAssetRecipe([source]);
