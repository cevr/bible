import { Schema } from 'effect';

import { PageReference, ParagraphReference, PublicationCode, PublicationId } from './model.js';

export class WritingsPublicationNotFoundError extends Schema.TaggedError<WritingsPublicationNotFoundError>()(
  'WritingsPublicationNotFoundError',
  { publication: Schema.Union([PublicationId, PublicationCode]) },
) {}

export class WritingsAmbiguousPublicationCodeError extends Schema.TaggedError<WritingsAmbiguousPublicationCodeError>()(
  'WritingsAmbiguousPublicationCodeError',
  {
    publication: PublicationCode,
    candidates: Schema.NonEmptyArray(PublicationId),
  },
) {}

export class WritingsPageNotFoundError extends Schema.TaggedError<WritingsPageNotFoundError>()(
  'WritingsPageNotFoundError',
  { reference: PageReference },
) {}

export class WritingsParagraphNotFoundError extends Schema.TaggedError<WritingsParagraphNotFoundError>()(
  'WritingsParagraphNotFoundError',
  { reference: ParagraphReference },
) {}

export class WritingsUnavailableError extends Schema.TaggedError<WritingsUnavailableError>()(
  'WritingsUnavailableError',
  {
    operation: Schema.Literals([
      'read-catalog',
      'read-publication',
      'read-paragraphs',
      'read-page',
      'read-headings',
      'search',
      'export-publication',
    ]),
    cause: Schema.Unknown,
  },
) {}

export class WritingsDataIntegrityError extends Schema.TaggedError<WritingsDataIntegrityError>()(
  'WritingsDataIntegrityError',
  {
    operation: Schema.Literals([
      'read-catalog',
      'read-publication',
      'read-paragraphs',
      'read-page',
      'read-headings',
      'search',
      'export-publication',
    ]),
    cause: Schema.Unknown,
  },
) {}

export class WritingsInvalidSearchError extends Schema.TaggedError<WritingsInvalidSearchError>()(
  'WritingsInvalidSearchError',
  { reason: Schema.Literals(['empty-query', 'invalid-limit']) },
) {}

export type WritingsError =
  | WritingsAmbiguousPublicationCodeError
  | WritingsPublicationNotFoundError
  | WritingsPageNotFoundError
  | WritingsParagraphNotFoundError
  | WritingsUnavailableError
  | WritingsDataIntegrityError
  | WritingsInvalidSearchError;
