/**
 * EGW Paragraph Database Service using Effect SQL
 *
 * Stores EGW books, paragraphs, Bible references, and sync status in a SQLite
 * database. The service depends only on `SqlClient.SqlClient`, so any
 * driver-specific layer (sqlite-bun, sqlite-node) can satisfy it.
 *
 * Schema:
 * - books: normalized book metadata (book_id PK, book_code, book_title, ...)
 * - paragraphs: per-paragraph content with pre-computed navigation fields
 *   (page_number, paragraph_number, is_chapter_heading)
 * - paragraph_bible_refs: indexed Bible reference lookup for commentary
 * - paragraphs_fts: FTS5 virtual table backed by paragraphs.content +
 *   refcode_short
 * - sync_status: incremental sync bookkeeping
 */

import { Context, Effect, Layer, Option, Schema, Stream } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';
import type { SqlError } from 'effect/unstable/sql/SqlError';

import * as EGWSchemas from '../egw/schemas.js';
import { isChapterHeading } from '../egw/parse.js';
import { RecordNotFoundError } from '../errors/database.js';
import type {
  DatabaseConnectionError,
  DatabaseQueryError,
  SchemaInitializationError,
} from '../errors/database.js';

export {
  DatabaseConnectionError,
  DatabaseQueryError,
  SchemaInitializationError,
} from '../errors/database.js';

export const ParagraphNotFoundError = RecordNotFoundError;
export type ParagraphNotFoundError = RecordNotFoundError;

export type ParagraphDatabaseError =
  | DatabaseConnectionError
  | DatabaseQueryError
  | RecordNotFoundError
  | SchemaInitializationError
  | SqlError;

export const BookRow = Schema.Struct({
  book_id: Schema.Number,
  book_code: Schema.String,
  book_title: Schema.String,
  book_author: Schema.String,
  paragraph_count: Schema.Number,
  created_at: Schema.String,
});

export type BookRow = Schema.Schema.Type<typeof BookRow>;

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

export const BibleRefRow = Schema.Struct({
  para_book_id: Schema.Number,
  para_ref_code: Schema.String,
  bible_book: Schema.Number,
  bible_chapter: Schema.Number,
  bible_verse: Schema.NullOr(Schema.Number),
});

export type BibleRefRow = Schema.Schema.Type<typeof BibleRefRow>;

export type SyncStatus = 'pending' | 'success' | 'failed';

export const SyncStatusRow = Schema.Struct({
  book_id: Schema.Number,
  book_code: Schema.String,
  status: Schema.String as Schema.Schema<SyncStatus>,
  error_message: Schema.NullOr(Schema.String),
  last_attempt: Schema.String,
  paragraph_count: Schema.Number,
});

export type SyncStatusRow = Schema.Schema.Type<typeof SyncStatusRow>;

// Parse "PP 351.1" -> { page: 351, paragraph: 1 }; "PP 351" -> { page: 351, paragraph: null }
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
    readonly (EGWSchemas.Paragraph & {
      bookCode: string;
      bookTitle: string;
      bookId: number;
    })[],
    ParagraphDatabaseError
  >;
  /**
   * Exact-match lookup by `refcode_short` (e.g. "PP 351.1"). Returns the
   * paragraph together with its book metadata so callers can navigate without
   * a second query. NOCASE so "pp 351.1" works too. Returns up to N matches —
   * the same refcode may appear in multiple books (rare; bumped to a small
   * limit so the caller can disambiguate).
   */
  readonly findByRefcodeShort: (
    refcodeShort: string,
    limit?: number,
  ) => Effect.Effect<
    readonly (EGWSchemas.Paragraph & { bookCode: string; bookTitle: string; bookId: number })[],
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
// Internal helpers
// ============================================================================

type FullParagraphRow = ParagraphRow & {
  book_code: string;
  book_title: string;
  book_author?: string;
};

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

// ============================================================================
// Service Definition
// ============================================================================

export class EGWParagraphDatabase extends Context.Service<
  EGWParagraphDatabase,
  EGWParagraphDatabaseService
>()('@bible/core/egw-db/book-database/EGWParagraphDatabase') {
  /**
   * Driver-agnostic layer: requires `SqlClient.SqlClient`. Initializes the
   * schema (idempotent) and exposes all CRUD/query operations. Compose with
   * a SQLite driver layer (sqlite-bun, sqlite-node) via `Layer.provide`.
   */
  static layerCore: Layer.Layer<EGWParagraphDatabase, SqlError, SqlClient.SqlClient> = Layer.effect(
    EGWParagraphDatabase,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      // Schema initialization (idempotent)
      yield* sql.unsafe(`
        CREATE TABLE IF NOT EXISTS books (
          book_id INTEGER PRIMARY KEY,
          book_code TEXT NOT NULL,
          book_title TEXT NOT NULL,
          book_author TEXT NOT NULL,
          paragraph_count INTEGER DEFAULT 0,
          created_at TEXT NOT NULL
        )
      `);
      yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_books_author ON books(book_author)`);
      yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_books_code ON books(book_code)`);

      yield* sql.unsafe(`
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
      yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_paragraphs_book_id ON paragraphs(book_id)`);
      yield* sql.unsafe(
        `CREATE INDEX IF NOT EXISTS idx_paragraphs_ref_code ON paragraphs(ref_code)`,
      );
      yield* sql.unsafe(
        `CREATE INDEX IF NOT EXISTS idx_paragraphs_puborder ON paragraphs(book_id, puborder)`,
      );
      yield* sql.unsafe(
        `CREATE INDEX IF NOT EXISTS idx_paragraphs_page ON paragraphs(book_id, page_number)`,
      );
      yield* sql.unsafe(
        `CREATE INDEX IF NOT EXISTS idx_paragraphs_chapter ON paragraphs(book_id, is_chapter_heading) WHERE is_chapter_heading = 1`,
      );

      yield* sql.unsafe(`
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
      yield* sql.unsafe(
        `CREATE INDEX IF NOT EXISTS idx_pbr_bible ON paragraph_bible_refs(bible_book, bible_chapter, bible_verse)`,
      );

      yield* sql.unsafe(`
        CREATE VIRTUAL TABLE IF NOT EXISTS paragraphs_fts USING fts5(
          content,
          refcode_short,
          book_id UNINDEXED,
          content=paragraphs,
          content_rowid=rowid
        )
      `);

      yield* sql.unsafe(`
        CREATE TABLE IF NOT EXISTS sync_status (
          book_id INTEGER PRIMARY KEY,
          book_code TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          error_message TEXT,
          last_attempt TEXT NOT NULL,
          paragraph_count INTEGER DEFAULT 0
        )
      `);
      yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_status(status)`);

      // ========== Book operations ==========

      const storeBook = (book: EGWSchemas.Book) =>
        sql`
          INSERT INTO books (book_id, book_code, book_title, book_author, paragraph_count, created_at)
          VALUES (${book.book_id}, ${book.code}, ${book.title}, ${book.author}, 0, ${new Date().toISOString()})
          ON CONFLICT(book_id) DO UPDATE SET
            book_code = excluded.book_code,
            book_title = excluded.book_title,
            book_author = excluded.book_author
        `.pipe(Effect.asVoid);

      const getBookById = (bookId: number) =>
        sql<BookRow>`SELECT * FROM books WHERE book_id = ${bookId}`.pipe(
          Effect.map((rows) => Option.fromNullishOr(rows[0])),
        );

      const getBookByCode = (bookCode: string) =>
        sql<BookRow>`SELECT * FROM books WHERE book_code = ${bookCode} COLLATE NOCASE`.pipe(
          Effect.map((rows) => Option.fromNullishOr(rows[0])),
        );

      const getBooksByAuthor = (author: string) =>
        Stream.fromIterableEffect(
          sql<BookRow>`SELECT * FROM books WHERE book_author = ${author} ORDER BY book_id`,
        );

      const getAllBooks = () =>
        Stream.fromIterableEffect(
          sql<BookRow>`SELECT * FROM books ORDER BY book_author, book_title`,
        );

      const updateBookCount = (bookId: number) =>
        sql`
          UPDATE books SET paragraph_count = (
            SELECT COUNT(*) FROM paragraphs WHERE book_id = ${bookId}
          ) WHERE book_id = ${bookId}
        `.pipe(Effect.asVoid);

      // ========== Paragraph operations ==========

      const insertParagraphRow = (row: ParagraphRow) =>
        sql`
          INSERT INTO paragraphs (
            book_id, ref_code, para_id, refcode_short, refcode_long,
            content, puborder, element_type, element_subtype,
            page_number, paragraph_number, is_chapter_heading,
            created_at, updated_at
          ) VALUES (
            ${row.book_id}, ${row.ref_code}, ${row.para_id}, ${row.refcode_short}, ${row.refcode_long},
            ${row.content}, ${row.puborder}, ${row.element_type}, ${row.element_subtype},
            ${row.page_number}, ${row.paragraph_number}, ${row.is_chapter_heading},
            ${row.created_at}, ${row.updated_at}
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
        `.pipe(Effect.asVoid);

      const storeParagraph = (paragraph: EGWSchemas.Paragraph, book: EGWSchemas.Book) =>
        Effect.gen(function* () {
          const now = new Date().toISOString();

          yield* storeBook(book);

          const refCode =
            paragraph.refcode_short ??
            paragraph.refcode_long ??
            paragraph.para_id ??
            `book-${book.book_id}-para-${paragraph.puborder}`;

          const existing = yield* sql<{ created_at: string }>`
            SELECT created_at FROM paragraphs
            WHERE book_id = ${book.book_id} AND ref_code = ${refCode}
          `;
          const createdAt = existing[0]?.created_at ?? now;
          const row = paragraphToRow(paragraph, book.book_id, createdAt, now);
          yield* insertParagraphRow(row);
        });

      const storeParagraphsBatch = (
        paragraphs: readonly EGWSchemas.Paragraph[],
        book: EGWSchemas.Book,
      ) =>
        sql.withTransaction(
          Effect.gen(function* () {
            const now = new Date().toISOString();
            yield* storeBook(book);
            for (const paragraph of paragraphs) {
              const row = paragraphToRow(paragraph, book.book_id, now, now);
              yield* insertParagraphRow(row);
            }
            return paragraphs.length;
          }),
        );

      const getParagraph = (bookId: number, refCode: string) =>
        sql<ParagraphRow>`
          SELECT * FROM paragraphs WHERE book_id = ${bookId} AND ref_code = ${refCode}
        `.pipe(
          Effect.map((rows) => {
            const row = rows[0];
            return row ? Option.some(rowToParagraph(row)) : Option.none<EGWSchemas.Paragraph>();
          }),
        );

      const getParagraphsByBook = (bookId: number) =>
        Stream.fromIterableEffect(
          sql<ParagraphRow>`
            SELECT * FROM paragraphs WHERE book_id = ${bookId} ORDER BY puborder
          `,
        ).pipe(Stream.map(rowToParagraph));

      const getParagraphsByAuthor = (author: string) =>
        Stream.fromIterableEffect(
          sql<ParagraphRow>`
            SELECT p.* FROM paragraphs p
            JOIN books b ON p.book_id = b.book_id
            WHERE b.book_author = ${author}
            ORDER BY p.book_id, p.puborder
          `,
        ).pipe(Stream.map(rowToParagraph));

      const getParagraphsByPage = (bookId: number, pageNumber: number) =>
        sql<ParagraphRow>`
          SELECT * FROM paragraphs
          WHERE book_id = ${bookId} AND page_number = ${pageNumber}
          ORDER BY puborder
        `.pipe(Effect.map((rows) => rows.map(rowToParagraph)));

      const getChapterHeadings = (bookId: number) =>
        sql<ParagraphRow>`
          SELECT * FROM paragraphs
          WHERE book_id = ${bookId} AND is_chapter_heading = 1
          ORDER BY puborder
        `.pipe(Effect.map((rows) => rows.map(rowToParagraph)));

      const searchParagraphs = (query: string, limit = 50, bookCode?: string) => {
        const base = bookCode
          ? sql<FullParagraphRow>`
              SELECT p.*, b.book_code, b.book_title
              FROM paragraphs p
              JOIN paragraphs_fts fts ON p.rowid = fts.rowid
              JOIN books b ON p.book_id = b.book_id
              WHERE paragraphs_fts MATCH ${query}
                AND b.book_code = ${bookCode} COLLATE NOCASE
              LIMIT ${limit}
            `
          : sql<FullParagraphRow>`
              SELECT p.*, b.book_code, b.book_title
              FROM paragraphs p
              JOIN paragraphs_fts fts ON p.rowid = fts.rowid
              JOIN books b ON p.book_id = b.book_id
              WHERE paragraphs_fts MATCH ${query}
              LIMIT ${limit}
            `;
        return base.pipe(
          Effect.map((rows) =>
            rows.map((row) => ({
              ...rowToParagraph(row),
              bookCode: row.book_code,
              bookTitle: row.book_title,
              bookId: row.book_id,
            })),
          ),
        );
      };

      const getMaxPage = (bookId: number) =>
        sql<{ max_page: number | null }>`
          SELECT MAX(page_number) as max_page FROM paragraphs WHERE book_id = ${bookId}
        `.pipe(Effect.map((rows) => rows[0]?.max_page ?? 1));

      const findByRefcodeShort = (refcodeShort: string, limit = 5) =>
        sql<FullParagraphRow>`
          SELECT p.*, b.book_code, b.book_title
          FROM paragraphs p
          JOIN books b ON p.book_id = b.book_id
          WHERE p.refcode_short = ${refcodeShort} COLLATE NOCASE
          ORDER BY b.book_code
          LIMIT ${limit}
        `.pipe(
          Effect.map((rows) =>
            rows.map((row) => ({
              ...rowToParagraph(row),
              bookCode: row.book_code,
              bookTitle: row.book_title,
              bookId: row.book_id,
            })),
          ),
        );

      // ========== Bible reference operations ==========

      const storeBibleRef = (
        bookId: number,
        refCode: string,
        bibleBook: number,
        bibleChapter: number,
        bibleVerse: number | null,
      ) =>
        sql`
          INSERT OR IGNORE INTO paragraph_bible_refs
          (para_book_id, para_ref_code, bible_book, bible_chapter, bible_verse)
          VALUES (${bookId}, ${refCode}, ${bibleBook}, ${bibleChapter}, ${bibleVerse})
        `.pipe(Effect.asVoid);

      const storeBibleRefsBatch = (
        refs: readonly {
          bookId: number;
          refCode: string;
          bibleBook: number;
          bibleChapter: number;
          bibleVerse: number | null;
        }[],
      ) =>
        refs.length === 0
          ? Effect.succeed(0)
          : sql.withTransaction(
              Effect.gen(function* () {
                for (const ref of refs) {
                  yield* storeBibleRef(
                    ref.bookId,
                    ref.refCode,
                    ref.bibleBook,
                    ref.bibleChapter,
                    ref.bibleVerse,
                  );
                }
                return refs.length;
              }),
            );

      const getBibleRefsByBook = (bookId: number) =>
        sql<BibleRefRow>`
          SELECT para_book_id, para_ref_code, bible_book, bible_chapter, bible_verse
          FROM paragraph_bible_refs WHERE para_book_id = ${bookId}
        `;

      const getParagraphsByBibleRef = (
        bibleBook: number,
        bibleChapter: number,
        bibleVerse?: number,
      ) => {
        const query =
          bibleVerse !== undefined
            ? sql<FullParagraphRow>`
                SELECT p.*, b.book_code, b.book_title
                FROM paragraphs p
                JOIN paragraph_bible_refs pbr
                  ON p.book_id = pbr.para_book_id AND p.ref_code = pbr.para_ref_code
                JOIN books b ON p.book_id = b.book_id
                WHERE pbr.bible_book = ${bibleBook}
                  AND pbr.bible_chapter = ${bibleChapter}
                  AND pbr.bible_verse = ${bibleVerse}
                ORDER BY b.book_code, p.puborder
              `
            : sql<FullParagraphRow>`
                SELECT p.*, b.book_code, b.book_title
                FROM paragraphs p
                JOIN paragraph_bible_refs pbr
                  ON p.book_id = pbr.para_book_id AND p.ref_code = pbr.para_ref_code
                JOIN books b ON p.book_id = b.book_id
                WHERE pbr.bible_book = ${bibleBook}
                  AND pbr.bible_chapter = ${bibleChapter}
                ORDER BY b.book_code, p.puborder
              `;
        return query.pipe(
          Effect.map((rows) =>
            rows.map((row) => ({
              ...rowToParagraph(row),
              bookCode: row.book_code,
              bookTitle: row.book_title,
            })),
          ),
        );
      };

      // ========== Sync status operations ==========

      const setSyncStatus = (
        bookId: number,
        bookCode: string,
        status: SyncStatus,
        paragraphCount: number,
        errorMessage?: string,
      ) =>
        sql`
          INSERT INTO sync_status (book_id, book_code, status, error_message, last_attempt, paragraph_count)
          VALUES (${bookId}, ${bookCode}, ${status}, ${errorMessage ?? null}, ${new Date().toISOString()}, ${paragraphCount})
          ON CONFLICT(book_id) DO UPDATE SET
            status = excluded.status,
            error_message = excluded.error_message,
            last_attempt = excluded.last_attempt,
            paragraph_count = excluded.paragraph_count
        `.pipe(Effect.asVoid);

      const getSyncStatus = (bookId: number) =>
        sql<SyncStatusRow>`SELECT * FROM sync_status WHERE book_id = ${bookId}`.pipe(
          Effect.map((rows) => Option.fromNullishOr(rows[0])),
        );

      const getBooksByStatus = (status: SyncStatus) =>
        sql<SyncStatusRow>`SELECT * FROM sync_status WHERE status = ${status}`;

      const getAllSyncStatus = () =>
        sql<SyncStatusRow>`SELECT * FROM sync_status ORDER BY book_code`;

      const needsSync = (bookId: number) =>
        getSyncStatus(bookId).pipe(
          Effect.map(
            (optStatus) => Option.isNone(optStatus) || optStatus.value.status !== 'success',
          ),
        );

      const rebuildFtsIndex = () =>
        sql
          .unsafe(`INSERT INTO paragraphs_fts(paragraphs_fts) VALUES('rebuild')`)
          .pipe(Effect.asVoid);

      return {
        storeBook,
        getBookById,
        getBookByCode,
        getBooksByAuthor,
        getAllBooks,
        updateBookCount,
        storeParagraph,
        storeParagraphsBatch,
        getParagraph,
        getParagraphsByBook,
        getParagraphsByAuthor,
        getParagraphsByPage,
        getChapterHeadings,
        searchParagraphs,
        findByRefcodeShort,
        getMaxPage,
        storeBibleRef,
        storeBibleRefsBatch,
        getBibleRefsByBook,
        getParagraphsByBibleRef,
        setSyncStatus,
        getSyncStatus,
        getBooksByStatus,
        getAllSyncStatus,
        needsSync,
        rebuildFtsIndex,
      };
    }),
  );

  /**
   * Test implementation with in-memory data.
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
      findByRefcodeShort: () => Effect.succeed([]),
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
