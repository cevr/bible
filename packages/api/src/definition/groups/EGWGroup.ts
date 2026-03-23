/**
 * EGW API Group - Endpoints for Ellen G. White writings
 *
 * Provides typed endpoints for:
 * - Listing available books
 * - Getting a page with paragraphs
 * - Getting chapter headings for navigation
 * - Searching paragraphs
 */
import { HttpApiEndpoint, HttpApiGroup } from 'effect/unstable/httpapi';
import { Schema as S } from 'effect';

// ============================================================================
// Schemas
// ============================================================================

export const EGWBookInfoSchema = S.Struct({
  bookId: S.Number,
  bookCode: S.String,
  title: S.String,
  author: S.String,
  paragraphCount: S.optional(S.Number),
});

export type EGWBookInfo = S.Schema.Type<typeof EGWBookInfoSchema>;

export const EGWParagraphSchema = S.Struct({
  paraId: S.NullOr(S.String),
  refcodeShort: S.NullOr(S.String),
  content: S.NullOr(S.String),
  puborder: S.Number,
  elementType: S.NullOr(S.String),
});

export type EGWParagraph = S.Schema.Type<typeof EGWParagraphSchema>;

export const EGWPageResponseSchema = S.Struct({
  book: EGWBookInfoSchema,
  page: S.Number,
  paragraphs: S.Array(EGWParagraphSchema),
  chapterHeading: S.NullOr(S.String),
  // For prefetch hints
  prevPage: S.NullOr(S.Number),
  nextPage: S.NullOr(S.Number),
  totalPages: S.Number,
});

export type EGWPageResponse = S.Schema.Type<typeof EGWPageResponseSchema>;

export const EGWChapterSchema = S.Struct({
  title: S.NullOr(S.String),
  refcodeShort: S.NullOr(S.String),
  puborder: S.Number,
  page: S.NullOr(S.Number),
});

export type EGWChapter = S.Schema.Type<typeof EGWChapterSchema>;

export const EGWSearchResultSchema = S.Struct({
  paraId: S.NullOr(S.String),
  refcodeShort: S.NullOr(S.String),
  content: S.NullOr(S.String),
  puborder: S.Number,
  bookCode: S.String,
  bookTitle: S.String,
});

export type EGWSearchResult = S.Schema.Type<typeof EGWSearchResultSchema>;

export const EGWBookDumpParagraphSchema = S.Struct({
  refCode: S.String,
  paraId: S.NullOr(S.String),
  refcodeShort: S.NullOr(S.String),
  refcodeLong: S.NullOr(S.String),
  content: S.NullOr(S.String),
  puborder: S.Number,
  elementType: S.NullOr(S.String),
  elementSubtype: S.NullOr(S.String),
  pageNumber: S.NullOr(S.Number),
  paragraphNumber: S.NullOr(S.Number),
  isChapterHeading: S.Boolean,
});

export type EGWBookDumpParagraph = S.Schema.Type<typeof EGWBookDumpParagraphSchema>;

export const EGWBookDumpBibleRefSchema = S.Struct({
  refCode: S.String,
  bibleBook: S.Number,
  bibleChapter: S.Number,
  bibleVerse: S.NullOr(S.Number),
});

export type EGWBookDumpBibleRef = S.Schema.Type<typeof EGWBookDumpBibleRefSchema>;

export const EGWBookDumpSchema = S.Struct({
  book: EGWBookInfoSchema,
  paragraphs: S.Array(EGWBookDumpParagraphSchema),
  bibleRefs: S.Array(EGWBookDumpBibleRefSchema),
});

export type EGWBookDump = S.Schema.Type<typeof EGWBookDumpSchema>;

// ============================================================================
// Errors
// ============================================================================

export class EGWBookNotFoundError extends S.TaggedErrorClass<EGWBookNotFoundError>()(
  'EGWBookNotFoundError',
  {
    bookCode: S.String,
    message: S.String,
  },
  { httpApiStatus: 404 },
) {}

export class EGWPageNotFoundError extends S.TaggedErrorClass<EGWPageNotFoundError>()(
  'EGWPageNotFoundError',
  {
    bookCode: S.String,
    page: S.Number,
    message: S.String,
  },
  { httpApiStatus: 404 },
) {}

export class EGWDatabaseError extends S.TaggedErrorClass<EGWDatabaseError>()(
  'EGWDatabaseError',
  {
    message: S.String,
  },
  { httpApiStatus: 500 },
) {}

// ============================================================================
// Group Definition
// ============================================================================

export const EGWGroup = HttpApiGroup.make('EGW')
  .add(
    HttpApiEndpoint.get('books', '/books', {
      success: S.Array(EGWBookInfoSchema),
      error: [EGWDatabaseError],
    }),
  )
  .add(
    HttpApiEndpoint.get('page', '/:bookCode/:page', {
      params: {
        bookCode: S.String,
        page: S.NumberFromString,
      },
      success: EGWPageResponseSchema,
      error: [EGWBookNotFoundError, EGWPageNotFoundError, EGWDatabaseError],
    }),
  )
  .add(
    HttpApiEndpoint.get('chapters', '/:bookCode/chapters', {
      params: {
        bookCode: S.String,
      },
      success: S.Array(EGWChapterSchema),
      error: [EGWBookNotFoundError, EGWDatabaseError],
    }),
  )
  .add(
    HttpApiEndpoint.get('search', '/search', {
      query: {
        q: S.String,
        bookCode: S.optional(S.String),
        limit: S.optional(S.NumberFromString).pipe(S.withDecodingDefault(() => '50')),
      },
      success: S.Array(EGWSearchResultSchema),
      error: [EGWDatabaseError],
    }),
  )
  .add(
    HttpApiEndpoint.get('bookDump', '/:bookCode/dump', {
      params: { bookCode: S.String },
      success: EGWBookDumpSchema,
      error: [EGWBookNotFoundError, EGWDatabaseError],
    }),
  )
  .prefix('/egw');
