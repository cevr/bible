import { Schema } from 'effect';

import { BookNumber, ChapterReference } from './model.js';

export class BibleBookNotFoundError extends Schema.TaggedError<BibleBookNotFoundError>()(
  'BibleBookNotFoundError',
  { book: BookNumber },
) {}

export class BibleChapterNotFoundError extends Schema.TaggedError<BibleChapterNotFoundError>()(
  'BibleChapterNotFoundError',
  { reference: ChapterReference },
) {}

export class BibleUnavailableError extends Schema.TaggedError<BibleUnavailableError>()(
  'BibleUnavailableError',
  {
    operation: Schema.Literals(['read-chapter', 'search']),
    cause: Schema.Unknown,
  },
) {}

export class BibleDataIntegrityError extends Schema.TaggedError<BibleDataIntegrityError>()(
  'BibleDataIntegrityError',
  {
    operation: Schema.Literals(['read-chapter', 'search']),
    cause: Schema.Unknown,
  },
) {}

export type BibleError =
  | BibleBookNotFoundError
  | BibleChapterNotFoundError
  | BibleUnavailableError
  | BibleDataIntegrityError;
