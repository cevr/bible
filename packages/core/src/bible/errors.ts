import { Schema } from 'effect';

import { BookNumber, ChapterReference } from './model.js';

export class BibleBookNotFoundError extends Schema.TaggedErrorClass<BibleBookNotFoundError>()(
  'BibleBookNotFoundError',
  { book: BookNumber },
) {}

export class BibleChapterNotFoundError extends Schema.TaggedErrorClass<BibleChapterNotFoundError>()(
  'BibleChapterNotFoundError',
  { reference: ChapterReference },
) {}

export class BibleUnavailableError extends Schema.TaggedErrorClass<BibleUnavailableError>()(
  'BibleUnavailableError',
  {
    operation: Schema.Literals(['load-canon', 'read-book', 'read-chapter', 'search']),
    cause: Schema.Unknown,
  },
) {}

export class BibleDataIntegrityError extends Schema.TaggedErrorClass<BibleDataIntegrityError>()(
  'BibleDataIntegrityError',
  {
    operation: Schema.Literals(['load-canon', 'read-book', 'read-chapter', 'search']),
    cause: Schema.Unknown,
  },
) {}

export type BibleError =
  | BibleBookNotFoundError
  | BibleChapterNotFoundError
  | BibleUnavailableError
  | BibleDataIntegrityError;
