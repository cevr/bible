/**
 * Cache database service — the EGW API-response cache (book lists, TOCs,
 * chapters, folders) plus the per-mode last-position rows, expressed as an
 * Effect service over the shared `SqlClient`.
 *
 * Why this exists: these tables used to be driven by a SECOND `better-sqlite3`
 * connection opened directly in `electron/main.ts` (`getCacheDb`), pointed at
 * the SAME `cache.sqlite` file that `@effect/sql-sqlite-node` already owns for
 * the EGW paragraph index. Two connections to one WAL-mode file collided:
 *   - `SQLITE_BUSY` ("database is locked") on writes during startup, and
 *   - the EGW index's `PRAGMA user_version = N` stamp was lost under that
 *     contention, so the version check re-dropped + rebuilt the paragraph
 *     tables on every launch (slow startup), and the renderer's
 *     `search:refcode` / `search:fts` IPC failed with `SqlError`.
 *
 * Routing the cache through the same `SqlClient` means a single serialized
 * connection owns the file — no contention, the version stamp persists, and
 * search stops throwing. `runtime.ts` was already warning that "opening two
 * connections to a WAL-mode file in the same process invites lock surprises";
 * this collapses to one.
 *
 * These tables are desktop-only (the API-response cache shape is whatever the
 * EGW client returned as opaque JSON), so the service lives in the app, not in
 * `@bible/core`. It depends only on `SqlClient.SqlClient`, so it composes onto
 * the same SQLite driver layer as the core DB services.
 */

import { Context, Effect, Layer, Option } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';
import type { SqlError } from 'effect/unstable/sql/SqlError';

export type LastPositionRow = {
  readonly book_id: number;
  readonly para_id: string | null;
  readonly paragraph_id: string | null;
};

export type BibleLastPositionRow = {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number | null;
};

export interface CacheDatabaseService {
  // EGW API-response cache. All values are the opaque JSON strings the EGW
  // client returned; the renderer re-parses through its own Schema.
  readonly getBooks: (lang: string) => Effect.Effect<string | null, SqlError>;
  readonly putBooks: (lang: string, json: string) => Effect.Effect<void, SqlError>;
  readonly getToc: (bookId: number) => Effect.Effect<string | null, SqlError>;
  readonly putToc: (bookId: number, json: string) => Effect.Effect<void, SqlError>;
  readonly getChapter: (bookId: number, paraId: string) => Effect.Effect<string | null, SqlError>;
  readonly putChapter: (
    bookId: number,
    paraId: string,
    json: string,
  ) => Effect.Effect<void, SqlError>;
  readonly chapterCount: (bookId: number) => Effect.Effect<number, SqlError>;
  readonly getFolders: (lang: string) => Effect.Effect<string | null, SqlError>;
  readonly putFolders: (lang: string, json: string) => Effect.Effect<void, SqlError>;
  readonly getFolderBooks: (
    folderId: number,
    lang: string,
  ) => Effect.Effect<string | null, SqlError>;
  readonly putFolderBooks: (
    folderId: number,
    lang: string,
    json: string,
  ) => Effect.Effect<void, SqlError>;

  // Per-mode last-open position (single-row tables, id = 0).
  readonly readLastPosition: () => Effect.Effect<LastPositionRow | null, SqlError>;
  readonly writeLastPosition: (
    bookId: number,
    paraId: string | null,
    paragraphId: string | null,
  ) => Effect.Effect<void, SqlError>;
  readonly clearLastPosition: () => Effect.Effect<void, SqlError>;
  readonly readBibleLastPosition: () => Effect.Effect<BibleLastPositionRow | null, SqlError>;
  readonly writeBibleLastPosition: (
    book: number,
    chapter: number,
    verse: number | null,
  ) => Effect.Effect<void, SqlError>;
  readonly clearBibleLastPosition: () => Effect.Effect<void, SqlError>;

  // --- indexer support -----------------------------------------------------
  // The chapter indexer (electron/indexer.ts) reads the cached library list to
  // resolve a book's metadata, and walks cached chapter blobs to (re)build the
  // EGW paragraph index. Both run against this same connection so they never
  // contend with the index writes.

  /** All cached `book_lists` JSON rows (one per language). */
  readonly allBookListJson: () => Effect.Effect<readonly string[], SqlError>;
  /**
   * Book ids that have cached chapter blobs but zero rows in the EGW
   * `paragraphs` index — the backfill work-list. Joins across the cache
   * (`chapters`) and index (`paragraphs`) tables in the same DB.
   */
  readonly booksNeedingIndex: () => Effect.Effect<readonly number[], SqlError>;
  /** Every cached chapter blob (JSON) for a book, for re-indexing. */
  readonly chapterJsonForBook: (bookId: number) => Effect.Effect<readonly string[], SqlError>;
}

const nowMs = (): number => Date.now();

export class CacheDatabase extends Context.Service<CacheDatabase, CacheDatabaseService>()(
  '@bible/desktop/electron/CacheDatabase',
) {
  /**
   * Driver-agnostic layer: requires `SqlClient.SqlClient`. Initializes the
   * cache-table schema (idempotent) and exposes the cache + last-position ops.
   * Compose with a SQLite driver layer (sqlite-node) via `Layer.provide` — the
   * SAME one the EGW/KJV/etc. services use, so a single connection owns the file.
   */
  static layerCore: Layer.Layer<CacheDatabase, SqlError, SqlClient.SqlClient> = Layer.effect(
    CacheDatabase,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      // Cache tables live alongside the EGW paragraph DB tables in the same
      // sqlite file. Names must not collide — the EGW DB owns `books` as
      // normalized metadata, so the API-response cache uses `book_lists`.
      yield* sql.unsafe(`
        CREATE TABLE IF NOT EXISTS book_lists (
          book_id INTEGER PRIMARY KEY,
          lang TEXT NOT NULL,
          json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS book_lists_lang ON book_lists(lang)`);
      yield* sql.unsafe(`
        CREATE TABLE IF NOT EXISTS tocs (
          book_id INTEGER PRIMARY KEY,
          json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      yield* sql.unsafe(`
        CREATE TABLE IF NOT EXISTS chapters (
          book_id INTEGER NOT NULL,
          para_id TEXT NOT NULL,
          json TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (book_id, para_id)
        )
      `);
      yield* sql.unsafe(`
        CREATE TABLE IF NOT EXISTS folders (
          lang TEXT PRIMARY KEY,
          json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      yield* sql.unsafe(`
        CREATE TABLE IF NOT EXISTS folder_books (
          folder_id INTEGER NOT NULL,
          lang TEXT NOT NULL,
          json TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (folder_id, lang)
        )
      `);
      yield* sql.unsafe(`
        CREATE TABLE IF NOT EXISTS last_position (
          id INTEGER PRIMARY KEY CHECK (id = 0),
          book_id INTEGER NOT NULL,
          para_id TEXT,
          updated_at INTEGER NOT NULL
        )
      `);
      yield* sql.unsafe(`
        CREATE TABLE IF NOT EXISTS bible_last_position (
          id INTEGER PRIMARY KEY CHECK (id = 0),
          book INTEGER NOT NULL,
          chapter INTEGER NOT NULL,
          verse INTEGER,
          updated_at INTEGER NOT NULL
        )
      `);
      // Additive migration: older DBs created last_position without paragraph_id.
      // SQLite has no "ADD COLUMN IF NOT EXISTS"; the duplicate-column error on
      // already-migrated DBs is the expected outcome and is safe to swallow.
      yield* sql
        .unsafe(`ALTER TABLE last_position ADD COLUMN paragraph_id TEXT`)
        .pipe(Effect.catch(() => Effect.void));

      // NOTE: kjv_verses + strongs_lexicon (and the EGW paragraph tables) are
      // created and owned by their own services against this same connection.

      const getBooks = (lang: string) =>
        sql<{
          json: string;
        }>`SELECT json FROM book_lists WHERE lang = ${lang} LIMIT 1`.pipe(
          Effect.map((rows) => rows[0]?.json ?? null),
        );

      const putBooks = (lang: string, json: string) =>
        // Single-row-per-lang model: a fresh list response replaces the previous
        // one wholesale (book_id = 0 is a sentinel — the list isn't per-book here).
        sql
          .withTransaction(
            Effect.gen(function* () {
              yield* sql`DELETE FROM book_lists WHERE lang = ${lang}`;
              yield* sql`INSERT INTO book_lists (book_id, lang, json, updated_at) VALUES (0, ${lang}, ${json}, ${nowMs()})`;
            }),
          )
          .pipe(Effect.asVoid);

      const getToc = (bookId: number) =>
        sql<{
          json: string;
        }>`SELECT json FROM tocs WHERE book_id = ${bookId}`.pipe(
          Effect.map((rows) => rows[0]?.json ?? null),
        );

      const putToc = (bookId: number, json: string) =>
        sql`
          INSERT INTO tocs (book_id, json, updated_at) VALUES (${bookId}, ${json}, ${nowMs()})
          ON CONFLICT(book_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at
        `.pipe(Effect.asVoid);

      const getChapter = (bookId: number, paraId: string) =>
        sql<{ json: string }>`
          SELECT json FROM chapters WHERE book_id = ${bookId} AND para_id = ${paraId}
        `.pipe(Effect.map((rows) => rows[0]?.json ?? null));

      const putChapter = (bookId: number, paraId: string, json: string) =>
        sql`
          INSERT INTO chapters (book_id, para_id, json, updated_at)
          VALUES (${bookId}, ${paraId}, ${json}, ${nowMs()})
          ON CONFLICT(book_id, para_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at
        `.pipe(Effect.asVoid);

      const chapterCount = (bookId: number) =>
        sql<{
          count: number;
        }>`SELECT COUNT(*) AS count FROM chapters WHERE book_id = ${bookId}`.pipe(
          Effect.map((rows) => rows[0]?.count ?? 0),
        );

      const getFolders = (lang: string) =>
        sql<{
          json: string;
        }>`SELECT json FROM folders WHERE lang = ${lang}`.pipe(
          Effect.map((rows) => rows[0]?.json ?? null),
        );

      const putFolders = (lang: string, json: string) =>
        sql`
          INSERT INTO folders (lang, json, updated_at) VALUES (${lang}, ${json}, ${nowMs()})
          ON CONFLICT(lang) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at
        `.pipe(Effect.asVoid);

      const getFolderBooks = (folderId: number, lang: string) =>
        sql<{ json: string }>`
          SELECT json FROM folder_books WHERE folder_id = ${folderId} AND lang = ${lang}
        `.pipe(Effect.map((rows) => rows[0]?.json ?? null));

      const putFolderBooks = (folderId: number, lang: string, json: string) =>
        sql`
          INSERT INTO folder_books (folder_id, lang, json, updated_at)
          VALUES (${folderId}, ${lang}, ${json}, ${nowMs()})
          ON CONFLICT(folder_id, lang) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at
        `.pipe(Effect.asVoid);

      const readLastPosition = () =>
        sql<LastPositionRow>`
          SELECT book_id, para_id, paragraph_id FROM last_position WHERE id = 0
        `.pipe(Effect.map((rows) => rows[0] ?? null));

      const writeLastPosition = (
        bookId: number,
        paraId: string | null,
        paragraphId: string | null,
      ) =>
        sql`
          INSERT INTO last_position (id, book_id, para_id, paragraph_id, updated_at)
          VALUES (0, ${bookId}, ${paraId}, ${paragraphId}, ${nowMs()})
          ON CONFLICT(id) DO UPDATE SET
            book_id = excluded.book_id,
            para_id = excluded.para_id,
            paragraph_id = excluded.paragraph_id,
            updated_at = excluded.updated_at
        `.pipe(Effect.asVoid);

      const clearLastPosition = () => sql`DELETE FROM last_position`.pipe(Effect.asVoid);

      const readBibleLastPosition = () =>
        sql<BibleLastPositionRow>`
          SELECT book, chapter, verse FROM bible_last_position WHERE id = 0
        `.pipe(Effect.map((rows) => rows[0] ?? null));

      const writeBibleLastPosition = (book: number, chapter: number, verse: number | null) =>
        sql`
          INSERT INTO bible_last_position (id, book, chapter, verse, updated_at)
          VALUES (0, ${book}, ${chapter}, ${verse}, ${nowMs()})
          ON CONFLICT(id) DO UPDATE SET
            book = excluded.book,
            chapter = excluded.chapter,
            verse = excluded.verse,
            updated_at = excluded.updated_at
        `.pipe(Effect.asVoid);

      const clearBibleLastPosition = () => sql`DELETE FROM bible_last_position`.pipe(Effect.asVoid);

      const allBookListJson = () =>
        sql<{ json: string }>`SELECT json FROM book_lists`.pipe(
          Effect.map((rows) => rows.map((r) => r.json)),
        );

      const booksNeedingIndex = () =>
        sql<{ book_id: number }>`
          SELECT c.book_id FROM chapters c
          LEFT JOIN paragraphs p ON p.book_id = c.book_id
          WHERE p.book_id IS NULL
          GROUP BY c.book_id
        `.pipe(Effect.map((rows) => rows.map((r) => r.book_id)));

      const chapterJsonForBook = (bookId: number) =>
        sql<{
          json: string;
        }>`SELECT json FROM chapters WHERE book_id = ${bookId}`.pipe(
          Effect.map((rows) => rows.map((r) => r.json)),
        );

      return {
        getBooks,
        putBooks,
        getToc,
        putToc,
        getChapter,
        putChapter,
        chapterCount,
        getFolders,
        putFolders,
        getFolderBooks,
        putFolderBooks,
        readLastPosition,
        writeLastPosition,
        clearLastPosition,
        readBibleLastPosition,
        writeBibleLastPosition,
        clearBibleLastPosition,
        allBookListJson,
        booksNeedingIndex,
        chapterJsonForBook,
      } satisfies CacheDatabaseService;
    }),
  );
}

// Re-exported so the indexer (which needs the cached book_lists / folder_books
// JSON and the chapters blobs) can pull the same `Option`-friendly shapes.
export { Option };
