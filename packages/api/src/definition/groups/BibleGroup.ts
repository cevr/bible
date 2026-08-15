/**
 * Bible API Group - Endpoints for Bible data access
 *
 * Provides typed endpoints for:
 * - Listing all books
 * - Getting a chapter with verses
 * - Searching verses
 */
import { HttpApiEndpoint, HttpApiGroup } from 'effect/unstable/httpapi';
import { Effect, Schema as S } from 'effect';

// ============================================================================
// Schemas
// ============================================================================

export const BookSchema = S.Struct({
  number: S.Finite,
  name: S.String,
  chapters: S.Finite,
  testament: S.Literals(['old', 'new']),
});

export type Book = S.Schema.Type<typeof BookSchema>;

export const VerseSchema = S.Struct({
  book: S.Finite,
  chapter: S.Finite,
  verse: S.Finite,
  text: S.String,
});

export type Verse = S.Schema.Type<typeof VerseSchema>;

export const ChapterReferenceSchema = S.Struct({
  book: S.Finite,
  chapter: S.Finite,
});

export type ChapterReference = S.Schema.Type<typeof ChapterReferenceSchema>;

export const ChapterResponseSchema = S.Struct({
  book: BookSchema,
  chapter: S.Finite,
  verses: S.Array(VerseSchema),
  // Adjacent chapters for prefetch hints
  prevChapter: S.NullOr(ChapterReferenceSchema),
  nextChapter: S.NullOr(ChapterReferenceSchema),
});

export type ChapterResponse = S.Schema.Type<typeof ChapterResponseSchema>;

export const SearchResultSchema = S.Struct({
  book: S.Finite,
  bookName: S.String,
  chapter: S.Finite,
  verse: S.Finite,
  text: S.String,
});

export type SearchResult = S.Schema.Type<typeof SearchResultSchema>;

// ============================================================================
// Errors
// ============================================================================

export class ChapterNotFoundError extends S.TaggedError<ChapterNotFoundError>()(
  'ChapterNotFoundError',
  {
    book: S.Finite,
    chapter: S.Finite,
    message: S.String,
  },
  { httpApiStatus: 404 },
) {}

export class BookNotFoundError extends S.TaggedError<BookNotFoundError>()(
  'BookNotFoundError',
  {
    book: S.Finite,
    message: S.String,
  },
  { httpApiStatus: 404 },
) {}

export class DatabaseError extends S.TaggedError<DatabaseError>()(
  'DatabaseError',
  {
    message: S.String,
  },
  { httpApiStatus: 500 },
) {}

// ============================================================================
// Group Definition
// ============================================================================

export const BibleGroup = HttpApiGroup.make('Bible')
  .add(
    HttpApiEndpoint.get('books', '/books', {
      success: S.Array(BookSchema),
      error: [DatabaseError],
    }),
  )
  .add(
    HttpApiEndpoint.get('chapter', '/:book/:chapter', {
      params: {
        book: S.FiniteFromString,
        chapter: S.FiniteFromString,
      },
      success: ChapterResponseSchema,
      error: [ChapterNotFoundError, BookNotFoundError, DatabaseError],
    }),
  )
  .add(
    HttpApiEndpoint.get('search', '/search', {
      query: {
        q: S.String,
        limit: S.optional(S.FiniteFromString).pipe(S.withDecodingDefault(Effect.succeed('20'))),
      },
      success: S.Array(SearchResultSchema),
      error: [DatabaseError],
    }),
  )
  .prefix('/bible');
