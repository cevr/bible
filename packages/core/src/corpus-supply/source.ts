import { Context, Layer } from 'effect';
import type { Effect } from 'effect';

import type { Publication, PublicationId } from '../writings/model.js';
import type { CorpusContributionRejectedError, CorpusSourceUnavailableError } from './errors.js';
import type { WritingsContribution } from './model.js';

export interface WritingsAssetSourceShape {
  readonly catalog: Effect.Effect<readonly Publication[], CorpusSourceUnavailableError>;
  readonly acquire: (
    publication: PublicationId,
  ) => Effect.Effect<
    WritingsContribution,
    CorpusSourceUnavailableError | CorpusContributionRejectedError
  >;
}

export class WritingsAssetSource extends Context.Service<
  WritingsAssetSource,
  WritingsAssetSourceShape
>()('@bible/core/corpus-supply/WritingsAssetSource') {}

export const layerWritingsAssetSource = (
  source: WritingsAssetSourceShape,
): Layer.Layer<WritingsAssetSource> =>
  Layer.succeed(WritingsAssetSource, WritingsAssetSource.of(source));
