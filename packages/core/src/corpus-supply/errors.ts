import { Schema } from 'effect';

import { PublicationId } from '../writings/model.js';

export class CorpusSourceUnavailableError extends Schema.TaggedErrorClass<CorpusSourceUnavailableError>()(
  'CorpusSourceUnavailableError',
  {
    operation: Schema.NonEmptyString,
    cause: Schema.Unknown,
  },
) {}

export class CorpusContributionRejectedError extends Schema.TaggedErrorClass<CorpusContributionRejectedError>()(
  'CorpusContributionRejectedError',
  {
    publication: PublicationId,
    cause: Schema.Unknown,
  },
) {}

export class CorpusInstallationError extends Schema.TaggedErrorClass<CorpusInstallationError>()(
  'CorpusInstallationError',
  {
    publication: Schema.optional(PublicationId),
    corpus: Schema.optional(Schema.Literals(['bible', 'writings'])),
    cause: Schema.Unknown,
  },
) {}

export class CorpusRecipeUnavailableError extends Schema.TaggedErrorClass<CorpusRecipeUnavailableError>()(
  'CorpusRecipeUnavailableError',
  {
    corpus: Schema.NonEmptyString,
  },
) {}

export type CorpusSupplyError =
  | CorpusSourceUnavailableError
  | CorpusContributionRejectedError
  | CorpusInstallationError
  | CorpusRecipeUnavailableError;
