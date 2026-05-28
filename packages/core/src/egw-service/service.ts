/**
 * EGW Service - Unified EGW writings access
 *
 * This service provides a high-level API for EGW operations.
 * Used by both TUI (via RPC) and web (via HttpApi) clients.
 */

import { Context, Effect, Layer, Option, Schema, Stream } from 'effect';

import { EGWParagraphDatabase, type ParagraphDatabaseError } from '../egw-db/book-database.js';
import { Node, nodesToText } from '../egw/ast.js';
import { isChapterHeading as isChapterHeadingType } from '../egw/parse.js';

function parsePageNumber(refcode: string | null): number | null {
  if (!refcode) return null;
  const match = refcode.match(/\s(\d+)\.(\d+)$/);
  if (match?.[1]) return parseInt(match[1], 10);
  const pageMatch = refcode.match(/\s(\d+)$/);
  if (pageMatch?.[1]) return parseInt(pageMatch[1], 10);
  return null;
}

function parseParagraphNumber(refcode: string | null): number | null {
  if (!refcode) return null;
  const match = refcode.match(/\s(\d+)\.(\d+)$/);
  if (match?.[2]) return parseInt(match[2], 10);
  return null;
}

// ============================================================================
// Types
// ============================================================================

/**
 * EGW Book info
 */
export class EGWBook extends Schema.Class<EGWBook>('EGWBook')({
  bookId: Schema.Number,
  bookCode: Schema.String,
  title: Schema.String,
  author: Schema.String,
  paragraphCount: Schema.optional(Schema.Number),
}) {}

/**
 * EGW Paragraph
 */
export class EGWParagraph extends Schema.Class<EGWParagraph>('EGWParagraph')({
  paraId: Schema.NullOr(Schema.String),
  refcodeShort: Schema.NullOr(Schema.String),
  nodes: Schema.Array(Node),
  puborder: Schema.Number,
  elementType: Schema.NullOr(Schema.String),
}) {}

/**
 * EGW Chapter (table of contents entry)
 */
export class EGWChapter extends Schema.Class<EGWChapter>('EGWChapter')({
  title: Schema.NullOr(Schema.String),
  refcodeShort: Schema.NullOr(Schema.String),
  puborder: Schema.Number,
  page: Schema.NullOr(Schema.Number),
}) {}

/**
 * EGW Page response
 */
export class EGWPageResponse extends Schema.Class<EGWPageResponse>('EGWPageResponse')({
  book: EGWBook,
  page: Schema.Number,
  paragraphs: Schema.Array(EGWParagraph),
  chapterHeading: Schema.NullOr(Schema.String),
  prevPage: Schema.NullOr(Schema.Number),
  nextPage: Schema.NullOr(Schema.Number),
  totalPages: Schema.Number,
}) {}

/**
 * EGW Search result
 */
export class EGWSearchResult extends Schema.Class<EGWSearchResult>('EGWSearchResult')({
  paraId: Schema.NullOr(Schema.String),
  refcodeShort: Schema.NullOr(Schema.String),
  nodes: Schema.Array(Node),
  puborder: Schema.Number,
  bookCode: Schema.String,
  bookTitle: Schema.String,
}) {}

/**
 * EGW Book Dump — all paragraphs + bible refs for a single book (for incremental sync)
 */
export class EGWBookDumpParagraph extends Schema.Class<EGWBookDumpParagraph>(
  'EGWBookDumpParagraph',
)({
  refCode: Schema.String,
  paraId: Schema.NullOr(Schema.String),
  refcodeShort: Schema.NullOr(Schema.String),
  refcodeLong: Schema.NullOr(Schema.String),
  nodes: Schema.Array(Node),
  puborder: Schema.Number,
  elementType: Schema.NullOr(Schema.String),
  elementSubtype: Schema.NullOr(Schema.String),
  pageNumber: Schema.NullOr(Schema.Number),
  paragraphNumber: Schema.NullOr(Schema.Number),
  isChapterHeading: Schema.Boolean,
}) {}

export class EGWBookDumpBibleRef extends Schema.Class<EGWBookDumpBibleRef>('EGWBookDumpBibleRef')({
  refCode: Schema.String,
  bibleBook: Schema.Number,
  bibleChapter: Schema.Number,
  bibleVerse: Schema.NullOr(Schema.Number),
}) {}

export class EGWBookDump extends Schema.Class<EGWBookDump>('EGWBookDump')({
  book: EGWBook,
  paragraphs: Schema.Array(EGWBookDumpParagraph),
  bibleRefs: Schema.Array(EGWBookDumpBibleRef),
}) {}

// ============================================================================
// Service Interface
// ============================================================================

/**
 * EGW service interface
 */
export interface EGWServiceShape {
  /**
   * Returns all installed writings in the local database, regardless of author.
   * Sorted by author then title.
   */
  readonly getBooks: () => Effect.Effect<readonly EGWBook[], ParagraphDatabaseError>;
  readonly getBook: (
    bookCode: string,
  ) => Effect.Effect<Option.Option<EGWBook>, ParagraphDatabaseError>;
  readonly getPage: (
    bookCode: string,
    page: number,
  ) => Effect.Effect<EGWPageResponse | null, ParagraphDatabaseError>;
  readonly getChapters: (
    bookCode: string,
  ) => Effect.Effect<readonly EGWChapter[], ParagraphDatabaseError>;
  readonly search: (
    query: string,
    limit?: number,
    bookCode?: string,
  ) => Effect.Effect<readonly EGWSearchResult[], ParagraphDatabaseError>;
  readonly getBookDump: (
    bookCode: string,
  ) => Effect.Effect<Option.Option<EGWBookDump>, ParagraphDatabaseError>;
}

// ============================================================================
// Service Definition
// ============================================================================

export class EGWService extends Context.Service<EGWService, EGWServiceShape>()(
  '@bible/core/egw-service/service/EGWService',
) {
  /**
   * Live implementation using EGWParagraphDatabase
   */
  static Live: Layer.Layer<EGWService, ParagraphDatabaseError, EGWParagraphDatabase> = Layer.effect(
    EGWService,
    Effect.gen(function* () {
      const db = yield* EGWParagraphDatabase;

      const getBooks = (): Effect.Effect<readonly EGWBook[], ParagraphDatabaseError> =>
        Stream.runCollect(db.getAllBooks()).pipe(
          Effect.map((chunk) =>
            [...chunk].map(
              (row) =>
                new EGWBook({
                  bookId: row.book_id,
                  bookCode: row.book_code,
                  title: row.book_title,
                  author: row.book_author,
                  paragraphCount: row.paragraph_count,
                }),
            ),
          ),
        );

      const getBook = (
        bookCode: string,
      ): Effect.Effect<Option.Option<EGWBook>, ParagraphDatabaseError> =>
        db.getBookByCode(bookCode).pipe(
          Effect.map((opt) =>
            Option.map(
              opt,
              (row) =>
                new EGWBook({
                  bookId: row.book_id,
                  bookCode: row.book_code,
                  title: row.book_title,
                  author: row.book_author,
                  paragraphCount: row.paragraph_count,
                }),
            ),
          ),
        );

      const getPage = (
        bookCode: string,
        page: number,
      ): Effect.Effect<EGWPageResponse | null, ParagraphDatabaseError> =>
        Effect.gen(function* () {
          // Get book info
          const bookOpt = yield* db.getBookByCode(bookCode);
          if (Option.isNone(bookOpt)) {
            return null;
          }
          const book = bookOpt.value;

          // Get paragraphs for this page
          const paragraphs = yield* db.getParagraphsByPage(book.book_id, page);
          if (paragraphs.length === 0) {
            return null;
          }

          // Convert to API types
          const apiParagraphs = paragraphs.map(
            (p) =>
              new EGWParagraph({
                paraId: Option.getOrNull(p.para_id),
                refcodeShort: Option.getOrNull(p.refcode_short),
                nodes: p.nodes,
                puborder: p.puborder,
                elementType: p.element_type ?? null,
              }),
          );

          // Find chapter heading for this page (flattened to plain text for the header chip)
          const chapterHeadingPara = paragraphs.find(
            (p) =>
              p.element_type?.toLowerCase().startsWith('h') ||
              p.element_type === 'chapter' ||
              p.element_type === 'title',
          );
          const chapterHeading = chapterHeadingPara ? nodesToText(chapterHeadingPara.nodes) : null;

          // Get actual max page from database
          const totalPages = yield* db.getMaxPage(book.book_id);

          return new EGWPageResponse({
            book: new EGWBook({
              bookId: book.book_id,
              bookCode: book.book_code,
              title: book.book_title,
              author: book.book_author,
              paragraphCount: book.paragraph_count,
            }),
            page,
            paragraphs: apiParagraphs,
            chapterHeading,
            prevPage: page > 1 ? page - 1 : null,
            nextPage: page < totalPages ? page + 1 : null,
            totalPages,
          });
        });

      const getChapters = (
        bookCode: string,
      ): Effect.Effect<readonly EGWChapter[], ParagraphDatabaseError> =>
        Effect.gen(function* () {
          const bookOpt = yield* db.getBookByCode(bookCode);
          if (Option.isNone(bookOpt)) {
            return [];
          }

          const headings = yield* db.getChapterHeadings(bookOpt.value.book_id);

          return headings.map((h) => {
            const refcodeShort = Option.getOrNull(h.refcode_short);
            // Parse page number from refcode
            const pageMatch = refcodeShort?.match(/\s(\d+)\./);
            const pageStr = pageMatch?.[1];
            const page = pageStr ? parseInt(pageStr, 10) : null;

            return new EGWChapter({
              title: nodesToText(h.nodes),
              refcodeShort,
              puborder: h.puborder,
              page,
            });
          });
        });

      const search = (
        query: string,
        limit: number = 50,
        bookCode?: string,
      ): Effect.Effect<readonly EGWSearchResult[], ParagraphDatabaseError> =>
        db.searchParagraphs(query, limit, bookCode).pipe(
          Effect.map((results) =>
            results.map(
              (r) =>
                new EGWSearchResult({
                  paraId: Option.getOrNull(r.para_id),
                  refcodeShort: Option.getOrNull(r.refcode_short),
                  nodes: r.nodes,
                  puborder: r.puborder,
                  bookCode: r.bookCode,
                  bookTitle: r.bookTitle,
                }),
            ),
          ),
        );

      const getBookDump = (
        bookCode: string,
      ): Effect.Effect<Option.Option<EGWBookDump>, ParagraphDatabaseError> =>
        Effect.gen(function* () {
          const bookOpt = yield* db.getBookByCode(bookCode);
          if (Option.isNone(bookOpt)) return Option.none();

          const book = bookOpt.value;
          const paragraphs = yield* Stream.runCollect(db.getParagraphsByBook(book.book_id));
          const bibleRefs = yield* db.getBibleRefsByBook(book.book_id);

          return Option.some(
            new EGWBookDump({
              book: new EGWBook({
                bookId: book.book_id,
                bookCode: book.book_code,
                title: book.book_title,
                author: book.book_author,
                paragraphCount: book.paragraph_count,
              }),
              paragraphs: [...paragraphs].map((p) => {
                const refcodeShort = Option.getOrNull(p.refcode_short);
                const paraId = Option.getOrNull(p.para_id);
                return new EGWBookDumpParagraph({
                  refCode:
                    refcodeShort ?? p.refcode_long ?? paraId ?? `${book.book_id}-${p.puborder}`,
                  paraId,
                  refcodeShort,
                  refcodeLong: p.refcode_long ?? null,
                  nodes: p.nodes,
                  puborder: p.puborder,
                  elementType: p.element_type ?? null,
                  elementSubtype: p.element_subtype ?? null,
                  pageNumber: parsePageNumber(refcodeShort ?? p.refcode_long ?? null),
                  paragraphNumber: parseParagraphNumber(refcodeShort ?? p.refcode_long ?? null),
                  isChapterHeading: isChapterHeadingType(p.element_type ?? null),
                });
              }),
              bibleRefs: bibleRefs.map(
                (r) =>
                  new EGWBookDumpBibleRef({
                    refCode: r.para_ref_code,
                    bibleBook: r.bible_book,
                    bibleChapter: r.bible_chapter,
                    bibleVerse: r.bible_verse,
                  }),
              ),
            }),
          );
        });

      return {
        getBooks,
        getBook,
        getPage,
        getChapters,
        search,
        getBookDump,
      };
    }),
  );

  /**
   * Default layer - alias for Live
   */
  static Default = EGWService.Live;

  /**
   * Test implementation with configurable mock data
   */
  static Test = (
    config: {
      books?: readonly EGWBook[];
      paragraphs?: readonly EGWParagraph[];
    } = {},
  ): Layer.Layer<EGWService> =>
    Layer.succeed(EGWService, {
      getBooks: () => Effect.succeed(config.books ?? []),
      getBook: (bookCode) =>
        Effect.succeed(
          Option.fromNullishOr(
            config.books?.find((b) => b.bookCode.toLowerCase() === bookCode.toLowerCase()),
          ),
        ),
      getPage: () => Effect.succeed(null),
      getChapters: () => Effect.succeed([]),
      search: () => Effect.succeed([]),
      getBookDump: () => Effect.succeed(Option.none()),
    });
}
