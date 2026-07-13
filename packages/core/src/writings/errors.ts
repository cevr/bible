import { Schema } from 'effect';

import { PageReference, PublicationCode } from './model.js';

export class WritingsPublicationNotFoundError extends Schema.TaggedErrorClass<WritingsPublicationNotFoundError>()(
  'WritingsPublicationNotFoundError',
  { publication: PublicationCode },
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
  | WritingsPublicationNotFoundError
  | WritingsPageNotFoundError
  | WritingsUnavailableError
  | WritingsDataIntegrityError
  | WritingsInvalidSearchError;
