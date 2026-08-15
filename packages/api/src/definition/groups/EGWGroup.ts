/**
 * EGW API Group - Endpoints for Ellen G. White writings
 *
 * Provides typed endpoints for:
 * - Listing available books
 * - Getting a page with paragraphs
 * - Getting chapter headings for navigation
 * - Searching paragraphs
 */
import { Node } from '@bible/core/egw';
import { PublicationArchiveJson } from '@bible/core/writings';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/unstable/httpapi';
import { Effect, Schema as S } from 'effect';

// ============================================================================
// Schemas
// ============================================================================

export const EGWBookInfoSchema = S.Struct({
  bookId: S.Finite,
  bookCode: S.String,
  title: S.String,
  author: S.String,
  paragraphCount: S.optional(S.Finite),
});

export type EGWBookInfo = S.Schema.Type<typeof EGWBookInfoSchema>;

export const EGWParagraphSchema = S.Struct({
  paraId: S.NullOr(S.String),
  refcodeShort: S.NullOr(S.String),
  nodes: S.Array(Node),
  puborder: S.Finite,
  elementType: S.NullOr(S.String),
});

export type EGWParagraph = S.Schema.Type<typeof EGWParagraphSchema>;

export const EGWPageResponseSchema = S.Struct({
  book: EGWBookInfoSchema,
  page: S.Finite,
  paragraphs: S.Array(EGWParagraphSchema),
  chapterHeading: S.NullOr(S.String),
  // For prefetch hints
  prevPage: S.NullOr(S.Finite),
  nextPage: S.NullOr(S.Finite),
});

export type EGWPageResponse = S.Schema.Type<typeof EGWPageResponseSchema>;

export const EGWChapterSchema = S.Struct({
  title: S.NullOr(S.String),
  refcodeShort: S.NullOr(S.String),
  puborder: S.Finite,
  page: S.NullOr(S.Finite),
});

export type EGWChapter = S.Schema.Type<typeof EGWChapterSchema>;

export const EGWSearchResultSchema = S.Struct({
  paraId: S.NullOr(S.String),
  refcodeShort: S.NullOr(S.String),
  nodes: S.Array(Node),
  puborder: S.Finite,
  bookCode: S.String,
  bookTitle: S.String,
});

export type EGWSearchResult = S.Schema.Type<typeof EGWSearchResultSchema>;

const PositiveIntegerFromString = S.FiniteFromString.pipe(S.check(S.isInt(), S.isGreaterThan(0)));

// ============================================================================
// Errors
// ============================================================================

export class EGWBookNotFoundError extends S.TaggedError<EGWBookNotFoundError>()(
  'EGWBookNotFoundError',
  {
    bookCode: S.String,
    message: S.String,
  },
  { httpApiStatus: 404 },
) {}

export class EGWPageNotFoundError extends S.TaggedError<EGWPageNotFoundError>()(
  'EGWPageNotFoundError',
  {
    bookCode: S.String,
    page: S.Finite,
    message: S.String,
  },
  { httpApiStatus: 404 },
) {}

export class EGWDatabaseError extends S.TaggedError<EGWDatabaseError>()(
  'EGWDatabaseError',
  {
    message: S.String,
  },
  { httpApiStatus: 500 },
) {}

export class EGWInvalidSearchError extends S.TaggedError<EGWInvalidSearchError>()(
  'EGWInvalidSearchError',
  {
    reason: S.Literals(['empty-query', 'invalid-limit']),
    message: S.String,
  },
  { httpApiStatus: 400 },
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
        page: PositiveIntegerFromString,
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
        bookCode: S.optional(S.NonEmptyString),
        limit: S.optional(S.FiniteFromString).pipe(S.withDecodingDefault(Effect.succeed('50'))),
      },
      success: S.Array(EGWSearchResultSchema),
      error: [EGWInvalidSearchError, EGWDatabaseError],
    }),
  )
  .add(
    HttpApiEndpoint.get('bookDump', '/:bookCode/dump', {
      params: { bookCode: S.String },
      success: PublicationArchiveJson,
      error: [EGWBookNotFoundError, EGWDatabaseError],
    }),
  )
  .prefix('/egw');
