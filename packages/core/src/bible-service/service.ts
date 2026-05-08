/**
 * Bible Service - Unified Bible data access
 *
 * This service provides a high-level API for Bible operations.
 * Used by both TUI (via RPC) and web (via HttpApi) clients.
 */

import { Context, Effect, Layer, Option, Schema } from 'effect';

import { BibleDatabase } from '../bible-db/bible-database.js';
import type { BibleDatabaseError } from '../bible-db/bible-database.js';
import { RecordNotFoundError } from '../errors/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Book information
 */
export class Book extends Schema.Class<Book>('Book')({
  number: Schema.Number,
  name: Schema.String,
  chapters: Schema.Number,
  testament: Schema.Literals(['old', 'new']),
}) {}

/**
 * Verse data
 */
export class Verse extends Schema.Class<Verse>('Verse')({
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.Number,
  text: Schema.String,
}) {}

/**
 * Chapter reference for navigation
 */
export class ChapterReference extends Schema.Class<ChapterReference>('ChapterReference')({
  book: Schema.Number,
  chapter: Schema.Number,
}) {}

/**
 * Search result
 */
export class SearchResult extends Schema.Class<SearchResult>('SearchResult')({
  book: Schema.Number,
  bookName: Schema.String,
  chapter: Schema.Number,
  verse: Schema.Number,
  text: Schema.String,
}) {}

/**
 * Chapter response with navigation
 */
export class ChapterResponse extends Schema.Class<ChapterResponse>('ChapterResponse')({
  book: Book,
  chapter: Schema.Number,
  verses: Schema.Array(Verse),
  prevChapter: Schema.NullOr(ChapterReference),
  nextChapter: Schema.NullOr(ChapterReference),
}) {}

// ============================================================================
// Service Interface
// ============================================================================

/**
 * Bible service interface
 */
export interface BibleServiceShape {
  readonly getBooks: () => Effect.Effect<readonly Book[], BibleDatabaseError>;
  readonly getBook: (bookNum: number) => Effect.Effect<Option.Option<Book>, BibleDatabaseError>;
  readonly getChapter: (
    bookNum: number,
    chapterNum: number,
  ) => Effect.Effect<ChapterResponse, BibleDatabaseError>;
  readonly search: (
    query: string,
    limit?: number,
  ) => Effect.Effect<readonly SearchResult[], BibleDatabaseError>;
}

// ============================================================================
// Service Definition
// ============================================================================

export class BibleService extends Context.Service<BibleService, BibleServiceShape>()(
  '@bible/core/bible-service/service/BibleService',
) {
  /**
   * Live implementation using BibleDatabase
   */
  static Live: Layer.Layer<BibleService, BibleDatabaseError, BibleDatabase> = Layer.effect(
    BibleService,
    Effect.gen(function* () {
      const db = yield* BibleDatabase;

      // Build book map for navigation lookups
      const booksResult = yield* db.getBooks();
      const bookMap = new Map<number, Book>();
      for (const b of booksResult) {
        bookMap.set(
          b.number,
          new Book({
            number: b.number,
            name: b.name,
            chapters: b.chapters,
            testament: b.testament,
          }),
        );
      }

      const getBooks = (): Effect.Effect<readonly Book[], BibleDatabaseError> =>
        db.getBooks().pipe(
          Effect.map((books) =>
            books.map(
              (b) =>
                new Book({
                  number: b.number,
                  name: b.name,
                  chapters: b.chapters,
                  testament: b.testament,
                }),
            ),
          ),
        );

      const getBook = (bookNum: number): Effect.Effect<Option.Option<Book>, BibleDatabaseError> =>
        db.getBook(bookNum).pipe(
          Effect.map((optBook) =>
            Option.map(
              optBook,
              (b) =>
                new Book({
                  number: b.number,
                  name: b.name,
                  chapters: b.chapters,
                  testament: b.testament,
                }),
            ),
          ),
        );

      const getChapter = (
        bookNum: number,
        chapterNum: number,
      ): Effect.Effect<ChapterResponse, BibleDatabaseError> =>
        Effect.gen(function* () {
          const bookOpt = yield* db.getBook(bookNum);
          const book = Option.getOrThrowWith(
            bookOpt,
            () => new RecordNotFoundError({ entity: 'Book', id: String(bookNum) }),
          );

          const verses = yield* db.getChapter(bookNum, chapterNum);

          // Calculate prev/next chapters
          let prevChapter: ChapterReference | null = null;
          let nextChapter: ChapterReference | null = null;

          if (chapterNum > 1) {
            prevChapter = new ChapterReference({
              book: bookNum,
              chapter: chapterNum - 1,
            });
          } else {
            const prevBook = bookMap.get(bookNum - 1);
            if (prevBook) {
              prevChapter = new ChapterReference({
                book: bookNum - 1,
                chapter: prevBook.chapters,
              });
            }
          }

          const currentBook = bookMap.get(bookNum);
          if (currentBook && chapterNum < currentBook.chapters) {
            nextChapter = new ChapterReference({
              book: bookNum,
              chapter: chapterNum + 1,
            });
          } else if (bookMap.has(bookNum + 1)) {
            nextChapter = new ChapterReference({
              book: bookNum + 1,
              chapter: 1,
            });
          }

          return new ChapterResponse({
            book: new Book({
              number: book.number,
              name: book.name,
              chapters: book.chapters,
              testament: book.testament,
            }),
            chapter: chapterNum,
            verses: verses.map(
              (v) =>
                new Verse({
                  book: v.book,
                  chapter: v.chapter,
                  verse: v.verse,
                  text: v.text,
                }),
            ),
            prevChapter,
            nextChapter,
          });
        });

      const search = (
        query: string,
        limit: number = 50,
      ): Effect.Effect<readonly SearchResult[], BibleDatabaseError> =>
        db.searchVerses(query, limit).pipe(
          Effect.map((results) =>
            results.map((r) => {
              const book = bookMap.get(r.book);
              return new SearchResult({
                book: r.book,
                bookName: book?.name ?? `Book ${r.book}`,
                chapter: r.chapter,
                verse: r.verse,
                text: r.text,
              });
            }),
          ),
        );

      return {
        getBooks,
        getBook,
        getChapter,
        search,
      };
    }),
  );

  /**
   * Default layer - alias for Live
   */
  static Default = BibleService.Live;

  /**
   * Test implementation with configurable mock data
   */
  static Test = (
    config: {
      books?: readonly Book[];
      verses?: readonly Verse[];
    } = {},
  ): Layer.Layer<BibleService> =>
    Layer.succeed(BibleService, {
      getBooks: () => Effect.succeed(config.books ?? []),
      getBook: (bookNum) =>
        Effect.succeed(Option.fromNullishOr(config.books?.find((b) => b.number === bookNum))),
      getChapter: (bookNum, chapterNum) =>
        Effect.succeed(
          new ChapterResponse({
            book:
              config.books?.find((b) => b.number === bookNum) ??
              new Book({
                number: bookNum,
                name: 'Test Book',
                chapters: 10,
                testament: 'new',
              }),
            chapter: chapterNum,
            verses:
              config.verses?.filter((v) => v.book === bookNum && v.chapter === chapterNum) ?? [],
            prevChapter: null,
            nextChapter: null,
          }),
        ),
      search: () => Effect.succeed([]),
    });
}
