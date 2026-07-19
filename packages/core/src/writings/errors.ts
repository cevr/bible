import { Schema } from 'effect';

import { PageReference, PublicationCode, PublicationId } from './model.js';

export class WritingsPublicationNotFoundError extends Schema.TaggedErrorClass<WritingsPublicationNotFoundError>()(
  'WritingsPublicationNotFoundError',
  { publication: Schema.Union([PublicationId, PublicationCode]) },
) {}

export class WritingsAmbiguousPublicationCodeError extends Schema.TaggedErrorClass<WritingsAmbiguousPublicationCodeError>()(
  'WritingsAmbiguousPublicationCodeError',
  {
    publication: PublicationCode,
    candidates: Schema.NonEmptyArray(PublicationId),
  },
) {}

export class WritingsPageNotFoundError extends Schema.TaggedErrorClass<WritingsPageNotFoundError>()(
  'WritingsPageNotFoundError',
  { reference: PageReference },
) {}

export class WritingsUnavailableError extends Schema.TaggedErrorClass<WritingsUnavailableError>()(
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

export class WritingsDataIntegrityError extends Schema.TaggedErrorClass<WritingsDataIntegrityError>()(
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

export class WritingsInvalidSearchError extends Schema.TaggedErrorClass<WritingsInvalidSearchError>()(
  'WritingsInvalidSearchError',
  { reason: Schema.Literals(['empty-query', 'invalid-limit']) },
) {}

export type WritingsError =
  | WritingsAmbiguousPublicationCodeError
  | WritingsPublicationNotFoundError
  | WritingsPageNotFoundError
  | WritingsUnavailableError
  | WritingsDataIntegrityError
  | WritingsInvalidSearchError;
