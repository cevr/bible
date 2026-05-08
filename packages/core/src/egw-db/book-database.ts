/**
 * EGW Paragraph Database Service using SQLite
 *
 * This service stores EGW paragraphs in a SQLite database for local caching,
 * avoiding repeated HTTP calls to the EGW API.
 *
 * Schema v2 changes:
 * - Normalized books table (eliminates denormalized book metadata)
 * - Pre-computed page_number, paragraph_number, is_chapter_heading columns
 * - paragraph_bible_refs table for indexed Bible reference lookup
 * - FTS5 virtual table for content search
 *
 * Essential fields:
 * - book_id (foreign key to books table)
 * - ref_code (refcode_short or refcode_long, primary identifier)
 * - para_id, content, puborder (paragraph data)
 * - page_number, paragraph_number (extracted from refcode)
 * - is_chapter_heading (for fast chapter navigation)
 */

import type { PlatformError } from 'effect/PlatformError';
import { Database } from 'bun:sqlite';
import { Config, Context, Effect, FileSystem, Layer, Option, Path, Schema, Stream } from 'effect';

import * as EGWSchemas from '../egw/schemas.js';
import { isChapterHeading } from '../egw/parse.js';
import {
  DatabaseConnectionError,
  DatabaseQueryError,
  RecordNotFoundError,
  SchemaInitializationError,
} from '../errors/index.js';

// Re-export errors for backwards compatibility
export {
  DatabaseConnectionError,
  DatabaseQueryError,
  SchemaInitializationError,
} from '../errors/index.js';

/**
 * Paragraph not found error (domain-specific alias)
 */
export const ParagraphNotFoundError = RecordNotFoundError;
export type ParagraphNotFoundError = RecordNotFoundError;

/**
 * Union type for all paragraph database errors
 */
export type ParagraphDatabaseError =
  | DatabaseConnectionError
  | DatabaseQueryError
  | RecordNotFoundError
  | SchemaInitializationError;

/**
 * Book Row type - normalized book metadata
 */
export const BookRow = Schema.Struct({
  book_id: Schema.Number,
  book_code: Schema.String,
  book_title: Schema.String,
  book_author: Schema.String,
  paragraph_count: Schema.Number,
  created_at: Schema.String,
});

export type BookRow = Schema.Schema.Type<typeof BookRow>;

/**
 * Paragraph Row type - stores paragraphs with book reference
 * Uses Schema.pick to select fields from the existing Paragraph schema,
 * then extends with book reference and database-specific fields
 */
const { para_id, refcode_short, refcode_long, content, puborder, element_type, element_subtype } =
  EGWSchemas.Paragraph.fields;

export const ParagraphRow = Schema.Struct({
  para_id,
  refcode_short,
  refcode_long,
  content,
  puborder,
  element_type,
  element_subtype,
  book_id: Schema.Number,
  ref_code: Schema.String,
  page_number: Schema.NullOr(Schema.Number),
  paragraph_number: Schema.NullOr(Schema.Number),
  is_chapter_heading: Schema.Number,
  created_at: Schema.String,
  updated_at: Schema.String,
});

export type ParagraphRow = Schema.Schema.Type<typeof ParagraphRow>;

/**
 * Bible Reference Row type - for indexed Bible reference lookups
 */
export const BibleRefRow = Schema.Struct({
  para_book_id: Schema.Number,
  para_ref_code: Schema.String,
  bible_book: Schema.Number,
  bible_chapter: Schema.Number,
  bible_verse: Schema.NullOr(Schema.Number),
});

export type BibleRefRow = Schema.Schema.Type<typeof BibleRefRow>;

/**
 * Sync status values
 */
export type SyncStatus = 'pending' | 'success' | 'failed';

/**
 * Sync Status Row type - for tracking incremental sync
 */
export const SyncStatusRow = Schema.Struct({
  book_id: Schema.Number,
  book_code: Schema.String,
  status: Schema.String as Schema.Schema<SyncStatus>,
  error_message: Schema.NullOr(Schema.String),
  last_attempt: Schema.String,
  paragraph_count: Schema.Number,
});

export type SyncStatusRow = Schema.Schema.Type<typeof SyncStatusRow>;

/**
 * Parse page and paragraph numbers from refcode
 * e.g., "PP 351.1" -> { page: 351, paragraph: 1 }
 */
function parseRefcodeNumbers(refcode: string | null): {
  page: number | null;
  paragraph: number | null;
} {
  if (!refcode) return { page: null, paragraph: null };
  const match = refcode.match(/\s(\d+)\.(\d+)$/);
  if (match) {
    const pageStr = match[1];
    const paraStr = match[2];
    return {
      page: pageStr ? parseInt(pageStr, 10) : null,
      paragraph: paraStr ? parseInt(paraStr, 10) : null,
    };
  }
  // Try page-only pattern (e.g., "PP 351")
  const pageMatch = refcode.match(/\s(\d+)$/);
  if (pageMatch) {
    const pageStr = pageMatch[1];
    return { page: pageStr ? parseInt(pageStr, 10) : null, paragraph: null };
  }
  return { page: null, paragraph: null };
}

// ============================================================================
// Service Interface
// ============================================================================

/**
 * EGW Paragraph Database service interface.
 * Provides storage and retrieval of EGW paragraphs in SQLite.
 */
export interface EGWParagraphDatabaseService {
  // Book operations
  readonly storeBook: (book: EGWSchemas.Book) => Effect.Effect<void, ParagraphDatabaseError>;
  readonly getBookById: (
    bookId: number,
  ) => Effect.Effect<Option.Option<BookRow>, ParagraphDatabaseError>;
  readonly getBookByCode: (
    bookCode: string,
  ) => Effect.Effect<Option.Option<BookRow>, ParagraphDatabaseError>;
  readonly getBooksByAuthor: (author: string) => Stream.Stream<BookRow, ParagraphDatabaseError>;
  readonly getAllBooks: () => Stream.Stream<BookRow, ParagraphDatabaseError>;
  readonly updateBookCount: (bookId: number) => Effect.Effect<void, ParagraphDatabaseError>;

  // Paragraph operations
  readonly storeParagraph: (
    paragraph: EGWSchemas.Paragraph,
    book: EGWSchemas.Book,
  ) => Effect.Effect<void, ParagraphDatabaseError>;
  readonly storeParagraphsBatch: (
    paragraphs: readonly EGWSchemas.Paragraph[],
    book: EGWSchemas.Book,
  ) => Effect.Effect<number, ParagraphDatabaseError>;
  readonly getParagraph: (
    bookId: number,
    refCode: string,
  ) => Effect.Effect<Option.Option<EGWSchemas.Paragraph>, ParagraphDatabaseError>;
  readonly getParagraphsByBook: (
    bookId: number,
  ) => Stream.Stream<EGWSchemas.Paragraph, ParagraphDatabaseError>;
  readonly getParagraphsByAuthor: (
    author: string,
  ) => Stream.Stream<EGWSchemas.Paragraph, ParagraphDatabaseError>;
  readonly getParagraphsByPage: (
    bookId: number,
    pageNumber: number,
  ) => Effect.Effect<readonly EGWSchemas.Paragraph[], ParagraphDatabaseError>;
  readonly getChapterHeadings: (
    bookId: number,
  ) => Effect.Effect<readonly EGWSchemas.Paragraph[], ParagraphDatabaseError>;
  readonly searchParagraphs: (
    query: string,
    limit?: number,
    bookCode?: string,
  ) => Effect.Effect<
    readonly (EGWSchemas.Paragraph & { bookCode: string; bookTitle: string })[],
    ParagraphDatabaseError
  >;
  readonly getMaxPage: (bookId: number) => Effect.Effect<number, ParagraphDatabaseError>;

  // Bible reference operations
  readonly storeBibleRef: (
    bookId: number,
    refCode: string,
    bibleBook: number,
    bibleChapter: number,
    bibleVerse: number | null,
  ) => Effect.Effect<void, ParagraphDatabaseError>;
  readonly storeBibleRefsBatch: (
    refs: readonly {
      bookId: number;
      refCode: string;
      bibleBook: number;
      bibleChapter: number;
      bibleVerse: number | null;
    }[],
  ) => Effect.Effect<number, ParagraphDatabaseError>;
  readonly getBibleRefsByBook: (
    bookId: number,
  ) => Effect.Effect<readonly BibleRefRow[], ParagraphDatabaseError>;
  readonly getParagraphsByBibleRef: (
    bibleBook: number,
    bibleChapter: number,
    bibleVerse?: number,
  ) => Effect.Effect<
    readonly (EGWSchemas.Paragraph & { bookCode: string; bookTitle: string })[],
    ParagraphDatabaseError
  >;

  // Sync status operations
  readonly setSyncStatus: (
    bookId: number,
    bookCode: string,
    status: SyncStatus,
    paragraphCount: number,
    errorMessage?: string,
  ) => Effect.Effect<void, ParagraphDatabaseError>;
  readonly getSyncStatus: (
    bookId: number,
  ) => Effect.Effect<Option.Option<SyncStatusRow>, ParagraphDatabaseError>;
  readonly getBooksByStatus: (
    status: SyncStatus,
  ) => Effect.Effect<readonly SyncStatusRow[], ParagraphDatabaseError>;
  readonly getAllSyncStatus: () => Effect.Effect<readonly SyncStatusRow[], ParagraphDatabaseError>;
  readonly needsSync: (bookId: number) => Effect.Effect<boolean, ParagraphDatabaseError>;

  // Maintenance
  readonly rebuildFtsIndex: () => Effect.Effect<void, ParagraphDatabaseError>;
}

// ============================================================================
// Service Definition
// ============================================================================

/**
 * EGW Paragraph Database Service
 */
export class EGWParagraphDatabase extends Context.Service<
  EGWParagraphDatabase,
  EGWParagraphDatabaseService
>()('@bible/core/egw-db/book-database/EGWParagraphDatabase') {
  /**
   * Live implementation using SQLite database.
   * Requires FileSystem and Path from @effect/platform.
   */
  static Live: Layer.Layer<
    EGWParagraphDatabase,
    DatabaseConnectionError | SchemaInitializationError | Config.ConfigError | PlatformError,
    FileSystem.FileSystem | Path.Path
  > = Layer.effect(
    EGWParagraphDatabase,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      // Get database file path from config or use default (~/.bible/egw-paragraphs.db)
      const homeDir = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '.';
      const defaultDbPath = path.join(homeDir, '.bible', 'egw-paragraphs.db');

      const dbFile = yield* Config.string('EGW_PARAGRAPH_DB').pipe(
        Config.withDefault(defaultDbPath),
      );

      const dbPath = path.resolve(dbFile);

      // Ensure directory exists
      yield* fs.makeDirectory(path.dirname(dbPath), { recursive: true }).pipe(Effect.orDie);

      // Open database connection
      const db = yield* Effect.try({
        try: () => new Database(dbPath),
        catch: (error) =>
          new DatabaseConnectionError({
            message: `Failed to open database at ${dbPath}`,
            cause: error,
          }),
      });

      // Initialize schema - books table (normalized)
      yield* Effect.try({
        try: () => {
          // Books table - normalized book metadata
          // Note: book_code is NOT unique - API returns multiple books with same code
          // (e.g., different volumes of periodicals). book_id is the true unique identifier.
          db.run(`
            CREATE TABLE IF NOT EXISTS books (
              book_id INTEGER PRIMARY KEY,
              book_code TEXT NOT NULL,
              book_title TEXT NOT NULL,
              book_author TEXT NOT NULL,
              paragraph_count INTEGER DEFAULT 0,
              created_at TEXT NOT NULL
            )
          `);
          db.run(`
            CREATE INDEX IF NOT EXISTS idx_books_author
            ON books(book_author)
          `);
          db.run(`
            CREATE INDEX IF NOT EXISTS idx_books_code
            ON books(book_code)
          `);

          // Paragraphs table - with pre-computed navigation fields
          db.run(`
            CREATE TABLE IF NOT EXISTS paragraphs (
              book_id INTEGER NOT NULL,
              ref_code TEXT NOT NULL,
              para_id TEXT,
              refcode_short TEXT,
              refcode_long TEXT,
              content TEXT,
              puborder INTEGER NOT NULL,
              element_type TEXT,
              element_subtype TEXT,
              page_number INTEGER,
              paragraph_number INTEGER,
              is_chapter_heading INTEGER DEFAULT 0,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              PRIMARY KEY (book_id, ref_code),
              FOREIGN KEY (book_id) REFERENCES books(book_id)
            )
          `);
          db.run(`
            CREATE INDEX IF NOT EXISTS idx_paragraphs_book_id
            ON paragraphs(book_id)
          `);
          db.run(`
            CREATE INDEX IF NOT EXISTS idx_paragraphs_ref_code
            ON paragraphs(ref_code)
          `);
          db.run(`
            CREATE INDEX IF NOT EXISTS idx_paragraphs_puborder
            ON paragraphs(book_id, puborder)
          `);
          db.run(`
            CREATE INDEX IF NOT EXISTS idx_paragraphs_page
            ON paragraphs(book_id, page_number)
          `);
          db.run(`
            CREATE INDEX IF NOT EXISTS idx_paragraphs_chapter
            ON paragraphs(book_id, is_chapter_heading)
            WHERE is_chapter_heading = 1
          `);

          // Bible reference index for fast commentary lookup
          db.run(`
            CREATE TABLE IF NOT EXISTS paragraph_bible_refs (
              para_book_id INTEGER NOT NULL,
              para_ref_code TEXT NOT NULL,
              bible_book INTEGER NOT NULL,
              bible_chapter INTEGER NOT NULL,
              bible_verse INTEGER,
              PRIMARY KEY (para_book_id, para_ref_code, bible_book, bible_chapter, bible_verse),
              FOREIGN KEY (para_book_id, para_ref_code) REFERENCES paragraphs(book_id, ref_code)
            )
          `);
          db.run(`
            CREATE INDEX IF NOT EXISTS idx_pbr_bible
            ON paragraph_bible_refs(bible_book, bible_chapter, bible_verse)
          `);

          // FTS5 virtual table for content search
          db.run(`
            CREATE VIRTUAL TABLE IF NOT EXISTS paragraphs_fts USING fts5(
              content,
              refcode_short,
              book_id UNINDEXED,
              content=paragraphs,
              content_rowid=rowid
            )
          `);

          // Sync status table for incremental sync
          db.run(`
            CREATE TABLE IF NOT EXISTS sync_status (
              book_id INTEGER PRIMARY KEY,
              book_code TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending',
              error_message TEXT,
              last_attempt TEXT NOT NULL,
              paragraph_count INTEGER DEFAULT 0
            )
          `);
          db.run(`
            CREATE INDEX IF NOT EXISTS idx_sync_status
            ON sync_status(status)
          `);
        },
        catch: (error) =>
          new SchemaInitializationError({
            message: 'Failed to initialize database schema',
            cause: error,
          }),
      });

      // Prepared statements for better performance
      const insertOrUpdateBookQuery = db.query(`
        INSERT INTO books (
          book_id, book_code, book_title, book_author, paragraph_count, created_at
        ) VALUES (
          $bookId, $bookCode, $bookTitle, $bookAuthor, $paragraphCount, $createdAt
        )
        ON CONFLICT(book_id) DO UPDATE SET
          book_code = excluded.book_code,
          book_title = excluded.book_title,
          book_author = excluded.book_author
      `);

      const updateBookParagraphCount = db.query(`
        UPDATE books SET paragraph_count = (
          SELECT COUNT(*) FROM paragraphs WHERE book_id = $bookId
        ) WHERE book_id = $bookId
      `);

      const insertOrUpdateParagraphQuery = db.query(`
        INSERT INTO paragraphs (
          book_id, ref_code, para_id, refcode_short, refcode_long,
          content, puborder, element_type, element_subtype,
          page_number, paragraph_number, is_chapter_heading,
          created_at, updated_at
        ) VALUES (
          $bookId, $refCode, $paraId, $refcodeShort, $refcodeLong,
          $content, $puborder, $elementType, $elementSubtype,
          $pageNumber, $paragraphNumber, $isChapterHeading,
          $createdAt, $updatedAt
        )
        ON CONFLICT(book_id, ref_code) DO UPDATE SET
          para_id = excluded.para_id,
          refcode_short = excluded.refcode_short,
          refcode_long = excluded.refcode_long,
          content = excluded.content,
          puborder = excluded.puborder,
          element_type = excluded.element_type,
          element_subtype = excluded.element_subtype,
          page_number = excluded.page_number,
          paragraph_number = excluded.paragraph_number,
          is_chapter_heading = excluded.is_chapter_heading,
          updated_at = excluded.updated_at
      `);

      const insertBibleRefQuery = db.query(`
        INSERT OR IGNORE INTO paragraph_bible_refs
        (para_book_id, para_ref_code, bible_book, bible_chapter, bible_verse)
        VALUES ($bookId, $refCode, $bibleBook, $bibleChapter, $bibleVerse)
      `);

      // Sync status queries
      const upsertSyncStatusQuery = db.query(`
        INSERT INTO sync_status (book_id, book_code, status, error_message, last_attempt, paragraph_count)
        VALUES ($bookId, $bookCode, $status, $errorMessage, $lastAttempt, $paragraphCount)
        ON CONFLICT(book_id) DO UPDATE SET
          status = excluded.status,
          error_message = excluded.error_message,
          last_attempt = excluded.last_attempt,
          paragraph_count = excluded.paragraph_count
      `);

      const getSyncStatusQuery = db.query<SyncStatusRow, { $bookId: number }>(`
        SELECT * FROM sync_status WHERE book_id = $bookId
      `);

      const getSyncStatusByStatusQuery = db.query<SyncStatusRow, { $status: string }>(`
        SELECT * FROM sync_status WHERE status = $status
      `);

      const getAllSyncStatusQuery = db.query<SyncStatusRow, Record<string, never>>(`
        SELECT * FROM sync_status ORDER BY book_code
      `);

      const getBibleRefsByBookQuery = db.query<BibleRefRow, { $bookId: number }>(`
        SELECT para_book_id, para_ref_code, bible_book, bible_chapter, bible_verse
        FROM paragraph_bible_refs WHERE para_book_id = $bookId
      `);

      const getParagraphByRefCodeQuery = db.query<
        ParagraphRow,
        { $bookId: number; $refCode: string }
      >(`
        SELECT * FROM paragraphs
        WHERE book_id = $bookId AND ref_code = $refCode
      `);

      const getParagraphsByBookQuery = db.query<ParagraphRow, { $bookId: number }>(`
        SELECT * FROM paragraphs
        WHERE book_id = $bookId
        ORDER BY puborder
      `);

      const getParagraphsByAuthorQuery = db.query<
        ParagraphRow & {
          book_code: string;
          book_title: string;
          book_author: string;
        },
        { $author: string }
      >(`
        SELECT p.*, b.book_code, b.book_title, b.book_author
        FROM paragraphs p
        JOIN books b ON p.book_id = b.book_id
        WHERE b.book_author = $author
        ORDER BY p.book_id, p.puborder
      `);

      const getDistinctBooksByAuthorQuery = db.query<BookRow, { $author: string }>(`
        SELECT *
        FROM books
        WHERE book_author = $author
        ORDER BY book_id
      `);

      const getAllBooksQuery = db.query<BookRow, Record<string, never>>(`
        SELECT *
        FROM books
        ORDER BY book_author, book_title
      `);

      const getBookByIdQuery = db.query<BookRow, { $bookId: number }>(`
        SELECT * FROM books WHERE book_id = $bookId
      `);

      const getBookByCodeQuery = db.query<BookRow, { $bookCode: string }>(`
        SELECT * FROM books WHERE book_code = $bookCode COLLATE NOCASE
      `);

      const getChapterHeadingsQuery = db.query<ParagraphRow, { $bookId: number }>(`
        SELECT * FROM paragraphs
        WHERE book_id = $bookId AND is_chapter_heading = 1
        ORDER BY puborder
      `);

      const getParagraphsByPageQuery = db.query<
        ParagraphRow,
        { $bookId: number; $pageNumber: number }
      >(`
        SELECT * FROM paragraphs
        WHERE book_id = $bookId AND page_number = $pageNumber
        ORDER BY puborder
      `);

      const searchParagraphsQuery = db.query<
        ParagraphRow & { book_code: string; book_title: string },
        { $query: string; $limit: number }
      >(`
        SELECT p.*, b.book_code, b.book_title
        FROM paragraphs p
        JOIN paragraphs_fts fts ON p.rowid = fts.rowid
        JOIN books b ON p.book_id = b.book_id
        WHERE paragraphs_fts MATCH $query
        LIMIT $limit
      `);

      /**
       * Convert Paragraph schema to database row format
       * Computes ref_code, page_number, paragraph_number, is_chapter_heading
       */
      const paragraphToRow = (
        paragraph: EGWSchemas.Paragraph,
        bookId: number,
        createdAt: string,
        updatedAt: string,
      ): ParagraphRow => {
        const refCode =
          paragraph.refcode_short ??
          paragraph.refcode_long ??
          paragraph.para_id ??
          `book-${bookId}-para-${paragraph.puborder}`;

        // Pre-compute navigation fields
        const { page, paragraph: paraNum } = parseRefcodeNumbers(
          paragraph.refcode_short ?? paragraph.refcode_long ?? null,
        );
        const chapterHeading = isChapterHeading(paragraph.element_type ?? null);

        return {
          para_id: paragraph.para_id ?? null,
          refcode_short: paragraph.refcode_short ?? null,
          refcode_long: paragraph.refcode_long ?? null,
          content: paragraph.content ?? null,
          puborder: paragraph.puborder,
          element_type: paragraph.element_type ?? null,
          element_subtype: paragraph.element_subtype ?? null,
          book_id: bookId,
          ref_code: refCode,
          page_number: page,
          paragraph_number: paraNum,
          is_chapter_heading: chapterHeading ? 1 : 0,
          created_at: createdAt,
          updated_at: updatedAt,
        };
      };

      /**
       * Convert database row to Paragraph schema
       * Note: This returns a paragraph object excluding database-specific fields
       */
      const rowToParagraph = (row: ParagraphRow): EGWSchemas.Paragraph => ({
        para_id: row.para_id ?? null,
        id_prev: null,
        id_next: null,
        refcode_1: null,
        refcode_2: null,
        refcode_3: null,
        refcode_4: null,
        refcode_short: row.refcode_short ?? null,
        refcode_long: row.refcode_long ?? null,
        element_type: row.element_type ?? null,
        element_subtype: row.element_subtype ?? null,
        content: row.content ?? null,
        puborder: row.puborder,
      });

      /**
       * Store or update a book in the database
       */
      const storeBook = (book: EGWSchemas.Book): Effect.Effect<void, ParagraphDatabaseError> =>
        Effect.try({
          try: () => {
            insertOrUpdateBookQuery.run({
              $bookId: book.book_id,
              $bookCode: book.code,
              $bookTitle: book.title,
              $bookAuthor: book.author,
              $paragraphCount: 0,
              $createdAt: new Date().toISOString(),
            });
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'storeBook',
              bookId: book.book_id,
              cause: error,
            }),
        });

      /**
       * Store or update a paragraph in the database
       * Ensures book is stored first (normalized schema)
       */
      const storeParagraph = (
        paragraph: EGWSchemas.Paragraph,
        book: EGWSchemas.Book,
      ): Effect.Effect<void, ParagraphDatabaseError> =>
        Effect.gen(function* () {
          const now = new Date().toISOString();

          // Ensure book exists first (upsert)
          yield* storeBook(book);

          // Compute ref_code to check for existing
          const refCode =
            paragraph.refcode_short ??
            paragraph.refcode_long ??
            paragraph.para_id ??
            `book-${book.book_id}-para-${paragraph.puborder}`;

          // Check if paragraph exists to preserve created_at
          const existing = yield* Effect.try({
            try: () =>
              getParagraphByRefCodeQuery.get({
                $bookId: book.book_id,
                $refCode: refCode,
              }),
            catch: (error) =>
              new DatabaseQueryError({
                operation: 'getParagraph',
                bookId: book.book_id,
                cause: error,
              }),
          });

          // Convert paragraph to row
          const row = paragraphToRow(paragraph, book.book_id, existing?.created_at ?? now, now);

          yield* Effect.try({
            try: () => {
              insertOrUpdateParagraphQuery.run({
                $bookId: row.book_id,
                $refCode: row.ref_code,
                $paraId: row.para_id ?? null,
                $refcodeShort: row.refcode_short ?? null,
                $refcodeLong: row.refcode_long ?? null,
                $content: row.content ?? null,
                $puborder: row.puborder,
                $elementType: row.element_type ?? null,
                $elementSubtype: row.element_subtype ?? null,
                $pageNumber: row.page_number,
                $paragraphNumber: row.paragraph_number,
                $isChapterHeading: row.is_chapter_heading,
                $createdAt: row.created_at,
                $updatedAt: row.updated_at,
              });
            },
            catch: (error) =>
              new DatabaseQueryError({
                operation: 'storeParagraph',
                bookId: book.book_id,
                cause: error,
              }),
          });
        });

      /**
       * Update book paragraph count (call after bulk insert)
       */
      const updateBookCount = (bookId: number): Effect.Effect<void, ParagraphDatabaseError> =>
        Effect.try({
          try: () => {
            updateBookParagraphCount.run({ $bookId: bookId });
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'updateBookCount',
              bookId,
              cause: error,
            }),
        });

      /**
       * Batch store paragraphs in a single transaction
       * Much faster than individual inserts - use for bulk sync operations
       */
      const storeParagraphsBatch = (
        paragraphs: readonly EGWSchemas.Paragraph[],
        book: EGWSchemas.Book,
      ): Effect.Effect<number, ParagraphDatabaseError> =>
        Effect.try({
          try: () => {
            const now = new Date().toISOString();

            // Use transaction for atomic batch insert
            db.run('BEGIN IMMEDIATE');
            try {
              // Ensure book exists first
              insertOrUpdateBookQuery.run({
                $bookId: book.book_id,
                $bookCode: book.code,
                $bookTitle: book.title,
                $bookAuthor: book.author,
                $paragraphCount: 0,
                $createdAt: now,
              });

              // Insert all paragraphs
              for (const paragraph of paragraphs) {
                const row = paragraphToRow(paragraph, book.book_id, now, now);
                insertOrUpdateParagraphQuery.run({
                  $bookId: row.book_id,
                  $refCode: row.ref_code,
                  $paraId: row.para_id ?? null,
                  $refcodeShort: row.refcode_short ?? null,
                  $refcodeLong: row.refcode_long ?? null,
                  $content: row.content ?? null,
                  $puborder: row.puborder,
                  $elementType: row.element_type ?? null,
                  $elementSubtype: row.element_subtype ?? null,
                  $pageNumber: row.page_number,
                  $paragraphNumber: row.paragraph_number,
                  $isChapterHeading: row.is_chapter_heading,
                  $createdAt: row.created_at,
                  $updatedAt: row.updated_at,
                });
              }

              db.run('COMMIT');
              return paragraphs.length;
            } catch (e) {
              db.run('ROLLBACK');
              throw e;
            }
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'storeParagraphsBatch',
              bookId: book.book_id,
              cause: error,
            }),
        });

      /**
       * Batch store Bible references in a single transaction
       */
      const storeBibleRefsBatch = (
        refs: readonly {
          bookId: number;
          refCode: string;
          bibleBook: number;
          bibleChapter: number;
          bibleVerse: number | null;
        }[],
      ): Effect.Effect<number, ParagraphDatabaseError> =>
        Effect.try({
          try: () => {
            if (refs.length === 0) return 0;

            db.run('BEGIN IMMEDIATE');
            try {
              for (const ref of refs) {
                insertBibleRefQuery.run({
                  $bookId: ref.bookId,
                  $refCode: ref.refCode,
                  $bibleBook: ref.bibleBook,
                  $bibleChapter: ref.bibleChapter,
                  $bibleVerse: ref.bibleVerse,
                });
              }
              db.run('COMMIT');
              return refs.length;
            } catch (e) {
              db.run('ROLLBACK');
              throw e;
            }
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'storeBibleRefsBatch',
              cause: error,
            }),
        });

      /**
       * Get a paragraph by book_id and ref_code
       */
      const getParagraph = (
        bookId: number,
        refCode: string,
      ): Effect.Effect<Option.Option<EGWSchemas.Paragraph>, ParagraphDatabaseError> =>
        Effect.try({
          try: () => {
            const row = getParagraphByRefCodeQuery.get({
              $bookId: bookId,
              $refCode: refCode,
            });
            return row ? Option.some(rowToParagraph(row)) : Option.none();
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'getParagraph',
              bookId: bookId,
              cause: error,
            }),
        });

      /**
       * Get all paragraphs for a book
       */
      const getParagraphsByBook = (
        bookId: number,
      ): Stream.Stream<EGWSchemas.Paragraph, ParagraphDatabaseError> =>
        Stream.fromEffect(
          Effect.try({
            try: () =>
              getParagraphsByBookQuery.all({
                $bookId: bookId,
              }),
            catch: (error) =>
              new DatabaseQueryError({
                operation: 'getParagraphsByBook',
                bookId: bookId,
                cause: error,
              }),
          }),
        ).pipe(
          Stream.flatMap((rows) => Stream.fromIterable(rows)),
          Stream.map(rowToParagraph),
        );

      /**
       * Get all paragraphs by author
       */
      const getParagraphsByAuthor = (
        author: string,
      ): Stream.Stream<EGWSchemas.Paragraph, ParagraphDatabaseError> =>
        Stream.fromEffect(
          Effect.try({
            try: () =>
              getParagraphsByAuthorQuery.all({
                $author: author,
              }),
            catch: (error) =>
              new DatabaseQueryError({
                operation: 'getParagraphsByAuthor',
                cause: error,
              }),
          }),
        ).pipe(
          Stream.flatMap((rows) => Stream.fromIterable(rows)),
          Stream.map(rowToParagraph),
        );

      /**
       * Get distinct books by author (for listing books)
       * Returns full book info from normalized books table
       */
      const getBooksByAuthor = (author: string): Stream.Stream<BookRow, ParagraphDatabaseError> =>
        Stream.fromEffect(
          Effect.try({
            try: () =>
              getDistinctBooksByAuthorQuery.all({
                $author: author,
              }),
            catch: (error) =>
              new DatabaseQueryError({
                operation: 'getBooksByAuthor',
                cause: error,
              }),
          }),
        ).pipe(Stream.flatMap((rows) => Stream.fromIterable(rows)));

      const getAllBooks = (): Stream.Stream<BookRow, ParagraphDatabaseError> =>
        Stream.fromEffect(
          Effect.try({
            try: () => getAllBooksQuery.all({}),
            catch: (error) =>
              new DatabaseQueryError({
                operation: 'getAllBooks',
                cause: error,
              }),
          }),
        ).pipe(Stream.flatMap((rows) => Stream.fromIterable(rows)));

      /**
       * Get a book by ID
       */
      const getBookById = (
        bookId: number,
      ): Effect.Effect<Option.Option<BookRow>, ParagraphDatabaseError> =>
        Effect.try({
          try: () => {
            const row = getBookByIdQuery.get({ $bookId: bookId });
            return row ? Option.some(row) : Option.none();
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'getBookById',
              bookId,
              cause: error,
            }),
        });

      /**
       * Get a book by code (case-insensitive)
       */
      const getBookByCode = (
        bookCode: string,
      ): Effect.Effect<Option.Option<BookRow>, ParagraphDatabaseError> =>
        Effect.try({
          try: () => {
            const row = getBookByCodeQuery.get({ $bookCode: bookCode });
            return row ? Option.some(row) : Option.none();
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'getBookByCode',
              cause: error,
            }),
        });

      /**
       * Get all chapter headings for a book (fast navigation)
       */
      const getChapterHeadings = (
        bookId: number,
      ): Effect.Effect<readonly EGWSchemas.Paragraph[], ParagraphDatabaseError> =>
        Effect.try({
          try: () => {
            const rows = getChapterHeadingsQuery.all({ $bookId: bookId });
            return rows.map(rowToParagraph);
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'getChapterHeadings',
              bookId,
              cause: error,
            }),
        });

      /**
       * Get all paragraphs on a specific page
       */
      const getParagraphsByPage = (
        bookId: number,
        pageNumber: number,
      ): Effect.Effect<readonly EGWSchemas.Paragraph[], ParagraphDatabaseError> =>
        Effect.try({
          try: () => {
            const rows = getParagraphsByPageQuery.all({
              $bookId: bookId,
              $pageNumber: pageNumber,
            });
            return rows.map(rowToParagraph);
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'getParagraphsByPage',
              bookId,
              cause: error,
            }),
        });

      /**
       * Search paragraphs using FTS5 full-text search
       * Optionally scoped to a specific book by bookCode
       */
      const searchParagraphs = (
        query: string,
        limit = 50,
        bookCode?: string,
      ): Effect.Effect<
        readonly (EGWSchemas.Paragraph & { bookCode: string; bookTitle: string })[],
        ParagraphDatabaseError
      > =>
        Effect.try({
          try: () => {
            if (bookCode) {
              // Book-scoped search
              const rows = db
                .query<
                  ParagraphRow & { book_code: string; book_title: string },
                  { $query: string; $limit: number; $bookCode: string }
                >(
                  `SELECT p.*, b.book_code, b.book_title
                   FROM paragraphs p
                   JOIN paragraphs_fts fts ON p.rowid = fts.rowid
                   JOIN books b ON p.book_id = b.book_id
                   WHERE paragraphs_fts MATCH $query
                     AND b.book_code = $bookCode COLLATE NOCASE
                   LIMIT $limit`,
                )
                .all({ $query: query, $limit: limit, $bookCode: bookCode });
              return rows.map((row) => ({
                ...rowToParagraph(row),
                bookCode: row.book_code,
                bookTitle: row.book_title,
              }));
            }
            const rows = searchParagraphsQuery.all({
              $query: query,
              $limit: limit,
            });
            return rows.map((row) => ({
              ...rowToParagraph(row),
              bookCode: row.book_code,
              bookTitle: row.book_title,
            }));
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'searchParagraphs',
              cause: error,
            }),
        });

      /**
       * Get the maximum page number for a book
       */
      const getMaxPage = (bookId: number): Effect.Effect<number, ParagraphDatabaseError> =>
        Effect.try({
          try: () => {
            const row = db
              .query<{ max_page: number | null }, { $bookId: number }>(
                `SELECT MAX(page_number) as max_page FROM paragraphs WHERE book_id = $bookId`,
              )
              .get({ $bookId: bookId });
            return row?.max_page ?? 1;
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'getMaxPage',
              bookId,
              cause: error,
            }),
        });

      /**
       * Store a Bible reference for a paragraph (for commentary lookup)
       */
      const storeBibleRef = (
        bookId: number,
        refCode: string,
        bibleBook: number,
        bibleChapter: number,
        bibleVerse: number | null,
      ): Effect.Effect<void, ParagraphDatabaseError> =>
        Effect.try({
          try: () => {
            insertBibleRefQuery.run({
              $bookId: bookId,
              $refCode: refCode,
              $bibleBook: bibleBook,
              $bibleChapter: bibleChapter,
              $bibleVerse: bibleVerse,
            });
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'storeBibleRef',
              bookId,
              cause: error,
            }),
        });

      /**
       * Get all Bible references for a given book
       */
      const getBibleRefsByBook = (
        bookId: number,
      ): Effect.Effect<readonly BibleRefRow[], ParagraphDatabaseError> =>
        Effect.try({
          try: () => getBibleRefsByBookQuery.all({ $bookId: bookId }),
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'getBibleRefsByBook',
              bookId,
              cause: error,
            }),
        });

      /**
       * Get paragraphs that cite a specific Bible verse
       */
      const getParagraphsByBibleRef = (
        bibleBook: number,
        bibleChapter: number,
        bibleVerse?: number,
      ): Effect.Effect<
        readonly (EGWSchemas.Paragraph & {
          bookCode: string;
          bookTitle: string;
        })[],
        ParagraphDatabaseError
      > =>
        Effect.try({
          try: () => {
            const query = bibleVerse
              ? `SELECT p.*, b.book_code, b.book_title
                 FROM paragraphs p
                 JOIN paragraph_bible_refs pbr ON p.book_id = pbr.para_book_id
                   AND p.ref_code = pbr.para_ref_code
                 JOIN books b ON p.book_id = b.book_id
                 WHERE pbr.bible_book = ? AND pbr.bible_chapter = ? AND pbr.bible_verse = ?
                 ORDER BY b.book_code, p.puborder`
              : `SELECT p.*, b.book_code, b.book_title
                 FROM paragraphs p
                 JOIN paragraph_bible_refs pbr ON p.book_id = pbr.para_book_id
                   AND p.ref_code = pbr.para_ref_code
                 JOIN books b ON p.book_id = b.book_id
                 WHERE pbr.bible_book = ? AND pbr.bible_chapter = ?
                 ORDER BY b.book_code, p.puborder`;

            const rows = bibleVerse
              ? (db.query(query).all(bibleBook, bibleChapter, bibleVerse) as (ParagraphRow & {
                  book_code: string;
                  book_title: string;
                })[])
              : (db.query(query).all(bibleBook, bibleChapter) as (ParagraphRow & {
                  book_code: string;
                  book_title: string;
                })[]);

            return rows.map((row) => ({
              ...rowToParagraph(row),
              bookCode: row.book_code,
              bookTitle: row.book_title,
            }));
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'getParagraphsByBibleRef',
              cause: error,
            }),
        });

      /**
       * Rebuild FTS5 index (call after bulk inserts)
       */
      const rebuildFtsIndex = (): Effect.Effect<void, ParagraphDatabaseError> =>
        Effect.try({
          try: () => {
            db.run(`INSERT INTO paragraphs_fts(paragraphs_fts) VALUES('rebuild')`);
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'rebuildFtsIndex',
              cause: error,
            }),
        });

      // ========== Sync Status Operations ==========

      /**
       * Update sync status for a book
       */
      const setSyncStatus = (
        bookId: number,
        bookCode: string,
        status: SyncStatus,
        paragraphCount: number,
        errorMessage?: string,
      ): Effect.Effect<void, ParagraphDatabaseError> =>
        Effect.try({
          try: () => {
            upsertSyncStatusQuery.run({
              $bookId: bookId,
              $bookCode: bookCode,
              $status: status,
              $errorMessage: errorMessage ?? null,
              $lastAttempt: new Date().toISOString(),
              $paragraphCount: paragraphCount,
            });
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'setSyncStatus',
              bookId,
              cause: error,
            }),
        });

      /**
       * Get sync status for a specific book
       */
      const getSyncStatus = (
        bookId: number,
      ): Effect.Effect<Option.Option<SyncStatusRow>, ParagraphDatabaseError> =>
        Effect.try({
          try: () => {
            const row = getSyncStatusQuery.get({ $bookId: bookId });
            return row ? Option.some(row) : Option.none();
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'getSyncStatus',
              bookId,
              cause: error,
            }),
        });

      /**
       * Get all books with a specific sync status
       */
      const getBooksByStatus = (
        status: SyncStatus,
      ): Effect.Effect<readonly SyncStatusRow[], ParagraphDatabaseError> =>
        Effect.try({
          try: () => getSyncStatusByStatusQuery.all({ $status: status }),
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'getBooksByStatus',
              cause: error,
            }),
        });

      /**
       * Get all sync statuses
       */
      const getAllSyncStatus = (): Effect.Effect<
        readonly SyncStatusRow[],
        ParagraphDatabaseError
      > =>
        Effect.try({
          try: () => getAllSyncStatusQuery.all({}),
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'getAllSyncStatus',
              cause: error,
            }),
        });

      /**
       * Check if a book needs syncing (not success status)
       */
      const needsSync = (bookId: number): Effect.Effect<boolean, ParagraphDatabaseError> =>
        getSyncStatus(bookId).pipe(
          Effect.map(
            (optStatus) => Option.isNone(optStatus) || optStatus.value.status !== 'success',
          ),
        );

      // Cleanup: close database when scope ends
      yield* Effect.addFinalizer(() =>
        Effect.try({
          try: () => {
            db.close(false); // Allow pending queries to finish
          },
          catch: (error) =>
            new DatabaseConnectionError({
              message: 'Failed to close database connection',
              cause: error,
            }),
        }).pipe(Effect.ignore),
      );

      return {
        // Book operations
        storeBook,
        getBookById,
        getBookByCode,
        getBooksByAuthor,
        getAllBooks,
        updateBookCount,
        // Paragraph operations
        storeParagraph,
        storeParagraphsBatch,
        getParagraph,
        getParagraphsByBook,
        getParagraphsByAuthor,
        getParagraphsByPage,
        getChapterHeadings,
        searchParagraphs,
        getMaxPage,
        // Bible reference operations
        storeBibleRef,
        storeBibleRefsBatch,
        getBibleRefsByBook,
        getParagraphsByBibleRef,
        // Sync status operations
        setSyncStatus,
        getSyncStatus,
        getBooksByStatus,
        getAllSyncStatus,
        needsSync,
        // Maintenance
        rebuildFtsIndex,
      };
    }),
  );

  /**
   * Default layer - alias for Live (backwards compatibility).
   */
  static Default = EGWParagraphDatabase.Live;

  /**
   * Test implementation with in-memory data.
   * Useful for unit testing without a real database.
   */
  static Test = (
    config: {
      books?: readonly BookRow[];
      paragraphs?: readonly (EGWSchemas.Paragraph & { bookCode: string })[];
    } = {},
  ): Layer.Layer<EGWParagraphDatabase> =>
    Layer.succeed(EGWParagraphDatabase, {
      storeBook: () => Effect.void,
      getBookById: (bookId) =>
        Effect.succeed(Option.fromNullishOr(config.books?.find((b) => b.book_id === bookId))),
      getBookByCode: (bookCode) =>
        Effect.succeed(
          Option.fromNullishOr(
            config.books?.find((b) => b.book_code.toLowerCase() === bookCode.toLowerCase()),
          ),
        ),
      getBooksByAuthor: (author) =>
        Stream.fromIterable(config.books?.filter((b) => b.book_author === author) ?? []),
      getAllBooks: () => Stream.fromIterable(config.books ?? []),
      updateBookCount: () => Effect.void,
      storeParagraph: () => Effect.void,
      storeParagraphsBatch: (paragraphs) => Effect.succeed(paragraphs.length),
      getParagraph: () => Effect.succeed(Option.none()),
      getParagraphsByBook: () => Stream.empty,
      getParagraphsByAuthor: () => Stream.empty,
      getParagraphsByPage: () => Effect.succeed([]),
      getChapterHeadings: () => Effect.succeed([]),
      searchParagraphs: () => Effect.succeed([]),
      getMaxPage: () => Effect.succeed(1),
      storeBibleRef: () => Effect.void,
      storeBibleRefsBatch: (refs) => Effect.succeed(refs.length),
      getBibleRefsByBook: () => Effect.succeed([]),
      getParagraphsByBibleRef: () => Effect.succeed([]),
      setSyncStatus: () => Effect.void,
      getSyncStatus: () => Effect.succeed(Option.none()),
      getBooksByStatus: () => Effect.succeed([]),
      getAllSyncStatus: () => Effect.succeed([]),
      needsSync: () => Effect.succeed(true),
      rebuildFtsIndex: () => Effect.void,
    });
}
