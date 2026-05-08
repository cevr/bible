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
  number: S.Number,
  name: S.String,
  chapters: S.Number,
  testament: S.Literals(['old', 'new']),
});

export type Book = S.Schema.Type<typeof BookSchema>;

export const VerseSchema = S.Struct({
  book: S.Number,
  chapter: S.Number,
  verse: S.Number,
  text: S.String,
});

export type Verse = S.Schema.Type<typeof VerseSchema>;

export const ChapterReferenceSchema = S.Struct({
  book: S.Number,
  chapter: S.Number,
});

export type ChapterReference = S.Schema.Type<typeof ChapterReferenceSchema>;

export const ChapterResponseSchema = S.Struct({
  book: BookSchema,
  chapter: S.Number,
  verses: S.Array(VerseSchema),
  // Adjacent chapters for prefetch hints
  prevChapter: S.NullOr(ChapterReferenceSchema),
  nextChapter: S.NullOr(ChapterReferenceSchema),
});

export type ChapterResponse = S.Schema.Type<typeof ChapterResponseSchema>;

export const SearchResultSchema = S.Struct({
  book: S.Number,
  bookName: S.String,
  chapter: S.Number,
  verse: S.Number,
  text: S.String,
});

export type SearchResult = S.Schema.Type<typeof SearchResultSchema>;

// ============================================================================
// Errors
// ============================================================================

export class ChapterNotFoundError extends S.TaggedErrorClass<ChapterNotFoundError>()(
  'ChapterNotFoundError',
  {
    book: S.Number,
    chapter: S.Number,
    message: S.String,
  },
  { httpApiStatus: 404 },
) {}

export class BookNotFoundError extends S.TaggedErrorClass<BookNotFoundError>()(
  'BookNotFoundError',
  {
    book: S.Number,
    message: S.String,
  },
  { httpApiStatus: 404 },
) {}

export class DatabaseError extends S.TaggedErrorClass<DatabaseError>()(
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
        book: S.NumberFromString,
        chapter: S.NumberFromString,
      },
      success: ChapterResponseSchema,
      error: [ChapterNotFoundError, BookNotFoundError, DatabaseError],
    }),
  )
  .add(
    HttpApiEndpoint.get('search', '/search', {
      query: {
        q: S.String,
        limit: S.optional(S.NumberFromString).pipe(S.withDecodingDefault(Effect.succeed('20'))),
      },
      success: S.Array(SearchResultSchema),
      error: [DatabaseError],
    }),
  )
  .prefix('/bible');
