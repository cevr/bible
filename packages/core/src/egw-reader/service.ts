/**
 * EGW Reader Service
 *
 * Renderer-agnostic service for reading EGW writings.
 * Provides book listing, chapter navigation, and paragraph access.
 *
 * This service wraps the EGWParagraphDatabase and provides
 * a higher-level API suitable for reader UIs.
 */

import { Context, Effect, Layer, Option, Schema, Stream } from 'effect';

import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import type * as EGWSchemas from '../egw/schemas.js';
import { EGWBookInfo, EGWParagraph } from './types.js';
import type { EGWReaderPosition } from './types.js';

/**
 * Error types for the reader service
 */
export class EGWReaderError extends Schema.TaggedErrorClass<EGWReaderError>()('EGWReaderError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

export class BookNotFoundError extends Schema.TaggedErrorClass<BookNotFoundError>()(
  'BookNotFoundError',
  {
    bookCode: Schema.String,
  },
) {}

export class DatabaseNotInitializedError extends Schema.TaggedErrorClass<DatabaseNotInitializedError>()(
  'DatabaseNotInitializedError',
  {
    message: Schema.String,
  },
) {}

/**
 * Union of all reader errors (Schema)
 */
export const ReaderError = Schema.Union([
  EGWReaderError,
  BookNotFoundError,
  DatabaseNotInitializedError,
]);

/**
 * Union of all reader errors (type)
 */
export type ReaderError = Schema.Schema.Type<typeof ReaderError>;

/**
 * Convert database Paragraph to EGWParagraph
 */
function schemaParagraphToEGWParagraph(para: EGWSchemas.Paragraph): EGWParagraph {
  return new EGWParagraph({
    paraId: para.para_id ?? undefined,
    refcodeShort: para.refcode_short ?? undefined,
    refcodeLong: para.refcode_long ?? undefined,
    content: para.content ?? undefined,
    puborder: para.puborder,
    elementType: para.element_type ?? undefined,
    elementSubtype: para.element_subtype ?? undefined,
  });
}

// ============================================================================
// Service Interface
// ============================================================================

/**
 * EGW Reader service interface.
 * Provides high-level reading operations on EGW writings.
 */
export interface EGWReaderServiceShape {
  readonly getBooks: (author?: string) => Effect.Effect<readonly EGWBookInfo[], ReaderError>;
  readonly getBookByCode: (
    bookCode: string,
  ) => Effect.Effect<Option.Option<EGWBookInfo>, ReaderError>;
  readonly getParagraphsByBook: (
    bookId: number,
  ) => Effect.Effect<readonly EGWParagraph[], ReaderError>;
  readonly getParagraphsByBookCode: (
    bookCode: string,
  ) => Effect.Effect<readonly EGWParagraph[], ReaderError>;
  readonly getParagraphByRefcode: (
    bookId: number,
    refcode: string,
  ) => Effect.Effect<Option.Option<EGWParagraph>, ReaderError>;
  readonly getParagraphsByPage: (
    bookCode: string,
    page: number,
  ) => Effect.Effect<readonly EGWParagraph[], ReaderError>;
  readonly getChapterHeadings: (
    bookId: number,
  ) => Effect.Effect<readonly EGWParagraph[], ReaderError>;
  readonly findParagraphByPosition: (
    paragraphs: readonly EGWParagraph[],
    position: EGWReaderPosition,
  ) => Option.Option<EGWParagraph>;
  readonly searchParagraphs: (
    query: string,
    limit?: number,
  ) => Effect.Effect<readonly (EGWParagraph & { bookCode: string })[], ReaderError>;
}

// ============================================================================
// Service Definition
// ============================================================================

/**
 * EGW Reader Service
 *
 * Provides high-level reading operations on EGW writings.
 */
export class EGWReaderService extends Context.Service<EGWReaderService, EGWReaderServiceShape>()(
  '@bible/core/egw-reader/service/EGWReaderService',
) {
  /**
   * Live implementation using EGWParagraphDatabase.
   */
  static Live: Layer.Layer<EGWReaderService, never, EGWParagraphDatabase> = Layer.effect(
    EGWReaderService,
    Effect.gen(function* () {
      const db = yield* EGWParagraphDatabase;

      /**
       * Get all available books
       */
      const getBooks = (
        author: string = 'Ellen Gould White',
      ): Effect.Effect<readonly EGWBookInfo[], ReaderError> =>
        db.getBooksByAuthor(author).pipe(
          Stream.map(
            (row) =>
              new EGWBookInfo({
                bookId: row.book_id,
                bookCode: row.book_code,
                title: row.book_title,
                author,
                pageCount: undefined,
              }),
          ),
          Stream.runCollect,
          Effect.map((chunk) => [...chunk]),
          Effect.mapError((e) => new EGWReaderError({ message: 'Failed to get books', cause: e })),
        );

      /**
       * Get a book by its code (O(1) index lookup)
       */
      const getBookByCode = (
        bookCode: string,
      ): Effect.Effect<Option.Option<EGWBookInfo>, ReaderError> =>
        db.getBookByCode(bookCode).pipe(
          Effect.map((opt) =>
            Option.map(
              opt,
              (row) =>
                new EGWBookInfo({
                  bookId: row.book_id,
                  bookCode: row.book_code,
                  title: row.book_title,
                  author: row.book_author,
                  pageCount: undefined,
                }),
            ),
          ),
          Effect.mapError((e) => new EGWReaderError({ message: 'Failed to get book', cause: e })),
        );

      /**
       * Get all paragraphs for a book
       */
      const getParagraphsByBook = (
        bookId: number,
      ): Effect.Effect<readonly EGWParagraph[], ReaderError> =>
        db.getParagraphsByBook(bookId).pipe(
          Stream.map(schemaParagraphToEGWParagraph),
          Stream.runCollect,
          Effect.map((chunk) => [...chunk]),
          Effect.mapError(
            (e) =>
              new EGWReaderError({
                message: 'Failed to get paragraphs',
                cause: e,
              }),
          ),
        );

      /**
       * Get paragraphs for a book by book code
       */
      const getParagraphsByBookCode = (
        bookCode: string,
      ): Effect.Effect<readonly EGWParagraph[], ReaderError> =>
        getBookByCode(bookCode).pipe(
          Effect.flatMap((optBook) =>
            Option.match(optBook, {
              onNone: () => Effect.fail(new BookNotFoundError({ bookCode })),
              onSome: (book) => getParagraphsByBook(book.bookId),
            }),
          ),
        );

      /**
       * Get a single paragraph by refcode
       */
      const getParagraphByRefcode = (
        bookId: number,
        refcode: string,
      ): Effect.Effect<Option.Option<EGWParagraph>, ReaderError> =>
        db.getParagraph(bookId, refcode).pipe(
          Effect.map((opt) => Option.map(opt, schemaParagraphToEGWParagraph)),
          Effect.mapError(
            (e) =>
              new EGWReaderError({
                message: 'Failed to get paragraph',
                cause: e,
              }),
          ),
        );

      /**
       * Get paragraphs matching a page number (O(log n) index lookup)
       * Uses pre-computed page_number column for fast lookup
       */
      const getParagraphsByPage = (
        bookCode: string,
        page: number,
      ): Effect.Effect<readonly EGWParagraph[], ReaderError> =>
        getBookByCode(bookCode).pipe(
          Effect.flatMap((optBook) =>
            Option.match(optBook, {
              onNone: () => Effect.fail<ReaderError>(new BookNotFoundError({ bookCode })),
              onSome: (book) =>
                db.getParagraphsByPage(book.bookId, page).pipe(
                  Effect.map((paras) => paras.map(schemaParagraphToEGWParagraph)),
                  Effect.mapError(
                    (e): ReaderError =>
                      new EGWReaderError({
                        message: 'Failed to get paragraphs by page',
                        cause: e,
                      }),
                  ),
                ),
            }),
          ),
        );

      /**
       * Find a paragraph by position (for navigation)
       */
      const findParagraphByPosition = (
        paragraphs: readonly EGWParagraph[],
        position: EGWReaderPosition,
      ): Option.Option<EGWParagraph> => {
        // If we have a puborder, find by that
        if (position.puborder != null) {
          const para = paragraphs.find((p) => p.puborder === position.puborder);
          return para ? Option.some(para) : Option.none();
        }

        // If we have page and paragraph, build refcode and search
        if (position.page != null && position.paragraph != null) {
          const refcode = `${position.bookCode} ${position.page}.${position.paragraph}`;
          const para = paragraphs.find((p) => {
            const ref = p.refcodeShort ?? p.refcodeLong ?? '';
            return ref.toUpperCase() === refcode.toUpperCase();
          });
          return para ? Option.some(para) : Option.none();
        }

        // If just page, find first paragraph on that page
        if (position.page != null) {
          const pagePrefix = `${position.bookCode} ${position.page}.`;
          const para = paragraphs.find((p) => {
            const ref = p.refcodeShort ?? p.refcodeLong ?? '';
            return ref.toUpperCase().startsWith(pagePrefix.toUpperCase());
          });
          return para ? Option.some(para) : Option.none();
        }

        // Default to first paragraph
        const first = paragraphs[0];
        return first ? Option.some(first) : Option.none();
      };

      /**
       * Search paragraphs by content (FTS5 full-text search)
       */
      const searchParagraphs = (
        query: string,
        limit: number = 50,
      ): Effect.Effect<readonly (EGWParagraph & { bookCode: string })[], ReaderError> =>
        db.searchParagraphs(query, limit).pipe(
          Effect.map((results) =>
            results.map((r) => ({
              ...schemaParagraphToEGWParagraph(r),
              bookCode: r.bookCode,
            })),
          ),
          Effect.mapError(
            (e) =>
              new EGWReaderError({
                message: 'Failed to search paragraphs',
                cause: e,
              }),
          ),
        );

      /**
       * Get chapter headings for a book (for TOC/navigation)
       */
      const getChapterHeadings = (
        bookId: number,
      ): Effect.Effect<readonly EGWParagraph[], ReaderError> =>
        db.getChapterHeadings(bookId).pipe(
          Effect.map((paras) => paras.map(schemaParagraphToEGWParagraph)),
          Effect.mapError(
            (e) =>
              new EGWReaderError({
                message: 'Failed to get chapter headings',
                cause: e,
              }),
          ),
        );

      return {
        getBooks,
        getBookByCode,
        getParagraphsByBook,
        getParagraphsByBookCode,
        getParagraphByRefcode,
        getParagraphsByPage,
        getChapterHeadings,
        findParagraphByPosition,
        searchParagraphs,
      };
    }),
  );

  /**
   * Default layer - alias for Live (backwards compatibility).
   */
  static Default = EGWReaderService.Live;

  /**
   * Test implementation with configurable mock data.
   */
  static Test = (
    config: {
      books?: readonly EGWBookInfo[];
      paragraphs?: readonly EGWParagraph[];
    } = {},
  ): Layer.Layer<EGWReaderService> =>
    Layer.succeed(EGWReaderService, {
      getBooks: () => Effect.succeed(config.books ?? []),
      getBookByCode: (bookCode) =>
        Effect.succeed(
          Option.fromNullishOr(
            config.books?.find((b) => b.bookCode.toLowerCase() === bookCode.toLowerCase()),
          ),
        ),
      getParagraphsByBook: () => Effect.succeed(config.paragraphs ?? []),
      getParagraphsByBookCode: () => Effect.succeed(config.paragraphs ?? []),
      getParagraphByRefcode: (_, refcode) =>
        Effect.succeed(
          Option.fromNullishOr(
            config.paragraphs?.find((p) => p.refcodeShort === refcode || p.refcodeLong === refcode),
          ),
        ),
      getParagraphsByPage: () => Effect.succeed([]),
      getChapterHeadings: () => Effect.succeed([]),
      findParagraphByPosition: (paragraphs, _position) =>
        paragraphs[0] ? Option.some(paragraphs[0]) : Option.none(),
      searchParagraphs: () => Effect.succeed([]),
    });
}
