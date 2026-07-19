import { EGWBookDumpSchema } from '@bible/api';
import { nodesToText } from '@bible/core/egw';
import { Schema } from 'effect';
import * as SQLite from 'wa-sqlite';

import type { DatabaseFileDownloader } from './database-file-downloader.js';
import type { SqliteDatabase, SqliteRow } from './sqlite-database.js';

export interface EgwSyncStatus {
  readonly bookId: number;
  readonly bookCode: string;
  readonly status: string;
  readonly paragraphCount: number;
  readonly error: string | null;
}

export interface EgwLocalBook {
  readonly bookId: number;
  readonly bookCode: string;
  readonly title: string;
  readonly author: string;
  readonly paragraphCount: number;
}

export interface EgwBookProgress {
  readonly bookCode: string;
  readonly stage: string;
  readonly progress: number;
}

export interface WorkerEgwDatabase {
  readonly initialize: () => Promise<void>;
  readonly query: (sql: string, params?: readonly unknown[]) => Promise<readonly SqliteRow[]>;
  readonly getBooks: () => Promise<readonly EgwLocalBook[]>;
  readonly getSyncStatus: () => Promise<readonly EgwSyncStatus[]>;
  readonly syncBook: (
    bookCode: string,
    onProgress: (event: EgwBookProgress) => void,
  ) => Promise<number>;
  readonly syncFull: (onProgress: (progress: number) => void) => Promise<void>;
  readonly autoSyncBibleCommentaries: (callbacks: {
    readonly onProgress: (event: EgwBookProgress) => void;
    readonly onComplete: (bookCode: string, count: number) => void;
    readonly onError: (bookCode: string, error: unknown) => void;
  }) => Promise<void>;
}

const EGW_SCHEMA_VERSION = 2;

const EGW_SCHEMA = `
  CREATE TABLE IF NOT EXISTS books (
    book_id INTEGER PRIMARY KEY,
    book_code TEXT NOT NULL,
    book_title TEXT NOT NULL,
    book_author TEXT NOT NULL,
    paragraph_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_books_code ON books(book_code);

  CREATE TABLE IF NOT EXISTS paragraphs (
    book_id INTEGER NOT NULL,
    ref_code TEXT NOT NULL,
    para_id TEXT,
    refcode_short TEXT,
    refcode_long TEXT,
    nodes_json TEXT NOT NULL,
    content_text TEXT NOT NULL,
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
  );
  CREATE INDEX IF NOT EXISTS idx_paragraphs_book_id ON paragraphs(book_id);
  CREATE INDEX IF NOT EXISTS idx_paragraphs_puborder ON paragraphs(book_id, puborder);
  CREATE INDEX IF NOT EXISTS idx_paragraphs_page ON paragraphs(book_id, page_number);

  CREATE TABLE IF NOT EXISTS paragraph_bible_refs (
    para_book_id INTEGER NOT NULL,
    para_ref_code TEXT NOT NULL,
    bible_book INTEGER NOT NULL,
    bible_chapter INTEGER NOT NULL,
    bible_verse INTEGER,
    PRIMARY KEY (para_book_id, para_ref_code, bible_book, bible_chapter, bible_verse),
    FOREIGN KEY (para_book_id, para_ref_code) REFERENCES paragraphs(book_id, ref_code)
  );
  CREATE INDEX IF NOT EXISTS idx_pbr_bible
    ON paragraph_bible_refs(bible_book, bible_chapter, bible_verse);

  CREATE TABLE IF NOT EXISTS sync_status (
    book_id INTEGER PRIMARY KEY,
    book_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    last_attempt TEXT NOT NULL,
    paragraph_count INTEGER DEFAULT 0
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS paragraphs_fts USING fts5(
    content_text,
    refcode_short,
    book_id UNINDEXED,
    content_rowid='rowid',
    tokenize='unicode61'
  );
`;

const BC_VOLUMES = ['1BC', '2BC', '3BC', '4BC', '5BC', '6BC', '7BC'];

export const makeWorkerEgwDatabase = (options: {
  readonly database: SqliteDatabase;
  readonly downloader: DatabaseFileDownloader;
  readonly fetch?: (url: string) => Promise<Response>;
  readonly log?: (line: string) => void;
}): WorkerEgwDatabase => {
  const fetchResponse = options.fetch ?? globalThis.fetch;
  const log = options.log ?? (() => {});

  const ensureEgwSchemaVersion = async (): Promise<void> => {
    const versionRows = await options.database.query('PRAGMA user_version');
    const value = versionRows[0]?.['user_version'];
    const currentVersion = typeof value === 'number' ? value : 0;
    if (currentVersion !== 0 && currentVersion !== EGW_SCHEMA_VERSION) {
      log(
        `[web.writings] schema-reset from=${String(currentVersion)} to=${String(EGW_SCHEMA_VERSION)}`,
      );
      await options.database.write('DROP TABLE IF EXISTS paragraphs_fts');
      await options.database.write('DROP TABLE IF EXISTS paragraph_bible_refs');
      await options.database.write('DROP TABLE IF EXISTS paragraphs');
      await options.database.write("UPDATE sync_status SET status = 'pending'").catch(() => {});
    }
    await options.database.write(`PRAGMA user_version = ${EGW_SCHEMA_VERSION}`);
  };

  const rebuildFtsForBook = async (bookId: number): Promise<void> => {
    await options.database.write(`DELETE FROM paragraphs_fts WHERE book_id = ?`, [bookId]);
    await options.database.write(
      `INSERT INTO paragraphs_fts(rowid, content_text, refcode_short, book_id)
       SELECT rowid, content_text, refcode_short, book_id
       FROM paragraphs WHERE book_id = ?`,
      [bookId],
    );
  };

  const rebuildAllFts = async (): Promise<void> => {
    await options.database.write(`DELETE FROM paragraphs_fts`);
    await options.database.write(
      `INSERT INTO paragraphs_fts(rowid, content_text, refcode_short, book_id)
       SELECT rowid, content_text, refcode_short, book_id
       FROM paragraphs`,
    );
    log('[web.writings] fts-rebuild-complete scope=all');
  };

  const isBookSynced = async (bookCode: string): Promise<boolean> => {
    try {
      const rows = await options.database.query(
        "SELECT status FROM sync_status WHERE book_code = ? AND status = 'success'",
        [bookCode],
      );
      return rows.length > 0;
    } catch {
      return false;
    }
  };

  const getSyncStatus = async (): Promise<readonly EgwSyncStatus[]> => {
    try {
      const rows = await options.database.query(
        'SELECT book_id, book_code, status, paragraph_count, error_message FROM sync_status ORDER BY book_code',
      );
      return rows.flatMap((row): readonly EgwSyncStatus[] => {
        const bookId = row['book_id'];
        const bookCode = row['book_code'];
        const status = row['status'];
        const paragraphCount = row['paragraph_count'];
        const error = row['error_message'];
        if (
          typeof bookId !== 'number' ||
          typeof bookCode !== 'string' ||
          typeof status !== 'string' ||
          typeof paragraphCount !== 'number'
        ) {
          return [];
        }
        return [
          {
            bookId,
            bookCode,
            status,
            paragraphCount,
            error: typeof error === 'string' ? error : null,
          },
        ];
      });
    } catch {
      return [];
    }
  };

  const getBooks = async (): Promise<readonly EgwLocalBook[]> => {
    const rows = await options.database.query(
      'SELECT book_id, book_code, book_title, book_author, paragraph_count FROM books ORDER BY book_author, book_title',
    );
    return rows.flatMap((row): readonly EgwLocalBook[] => {
      const bookId = row['book_id'];
      const bookCode = row['book_code'];
      const title = row['book_title'];
      const author = row['book_author'];
      const paragraphCount = row['paragraph_count'];
      if (
        typeof bookId !== 'number' ||
        typeof bookCode !== 'string' ||
        typeof title !== 'string' ||
        typeof author !== 'string' ||
        typeof paragraphCount !== 'number'
      ) {
        return [];
      }
      return [{ bookId, bookCode, title, author, paragraphCount }];
    });
  };

  const syncBook = async (
    bookCode: string,
    onProgress: (event: EgwBookProgress) => void,
  ): Promise<number> => {
    if (await isBookSynced(bookCode)) {
      log(`[web.writings] sync-skipped book=${bookCode}`);
      return 0;
    }

    onProgress({ bookCode, stage: 'Fetching...', progress: 0 });

    const response = await fetchResponse(`/api/egw/${encodeURIComponent(bookCode)}/dump`);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${bookCode}: ${response.statusText}`);
    }

    onProgress({ bookCode, stage: 'Parsing...', progress: 30 });
    const dump = await Schema.decodeUnknownPromise(EGWBookDumpSchema)(await response.json());
    const { book, paragraphs, bibleRefs } = dump;

    onProgress({ bookCode, stage: 'Inserting...', progress: 50 });

    const now = new Date().toISOString();

    await options.database.write('BEGIN IMMEDIATE');
    try {
      await options.database.write(
        `INSERT INTO books (book_id, book_code, book_title, book_author, paragraph_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(book_id) DO UPDATE SET
           book_code = excluded.book_code,
           book_title = excluded.book_title,
           book_author = excluded.book_author,
           paragraph_count = excluded.paragraph_count`,
        [book.bookId, book.bookCode, book.title, book.author, paragraphs.length, now],
      );

      /* eslint-disable no-await-in-loop */
      for (const paragraph of paragraphs) {
        await options.database.write(
          `INSERT OR REPLACE INTO paragraphs
           (book_id, ref_code, para_id, refcode_short, refcode_long, nodes_json, content_text,
            puborder, element_type, element_subtype, page_number, paragraph_number,
            is_chapter_heading, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            book.bookId,
            paragraph.refCode,
            paragraph.paraId,
            paragraph.refcodeShort,
            null,
            JSON.stringify(paragraph.nodes),
            nodesToText(paragraph.nodes),
            paragraph.puborder,
            paragraph.elementType,
            paragraph.elementSubtype,
            paragraph.pageNumber,
            paragraph.paragraphNumber,
            paragraph.isChapterHeading ? 1 : 0,
            now,
            now,
          ],
        );
      }

      onProgress({ bookCode, stage: 'Bible refs...', progress: 80 });

      for (const bibleRef of bibleRefs) {
        await options.database.write(
          `INSERT OR IGNORE INTO paragraph_bible_refs
           (para_book_id, para_ref_code, bible_book, bible_chapter, bible_verse)
           VALUES (?, ?, ?, ?, ?)`,
          [
            book.bookId,
            bibleRef.refCode,
            bibleRef.bibleBook,
            bibleRef.bibleChapter,
            bibleRef.bibleVerse,
          ],
        );
      }
      /* eslint-enable no-await-in-loop */

      await options.database.write(
        `INSERT INTO sync_status (book_id, book_code, status, last_attempt, paragraph_count)
         VALUES (?, ?, 'success', ?, ?)
         ON CONFLICT(book_id) DO UPDATE SET
           status = 'success',
           error_message = NULL,
           last_attempt = excluded.last_attempt,
           paragraph_count = excluded.paragraph_count`,
        [book.bookId, bookCode, now, paragraphs.length],
      );

      await options.database.write('COMMIT');
    } catch (error) {
      await options.database.write('ROLLBACK').catch(() => {});
      throw error;
    }

    onProgress({ bookCode, stage: 'Indexing...', progress: 95 });
    await rebuildFtsForBook(book.bookId);

    onProgress({ bookCode, stage: 'Done', progress: 100 });
    log(
      `[web.writings] sync-complete book=${bookCode} paragraphs=${String(paragraphs.length)}`,
    );
    return paragraphs.length;
  };

  const initialize = async (): Promise<void> => {
    await options.database.open(SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE);
    await ensureEgwSchemaVersion();
    await options.database.exec(EGW_SCHEMA);
    log('[web.writings] schema-ready database=egw-paragraphs');

    const ftsCountRows = await options.database.query('SELECT COUNT(*) as n FROM paragraphs_fts');
    const paragraphCountRows = await options.database.query('SELECT COUNT(*) as n FROM paragraphs');
    const ftsCount = ftsCountRows[0]?.['n'];
    const paragraphCount = paragraphCountRows[0]?.['n'];
    if (
      typeof paragraphCount === 'number' &&
      paragraphCount > 0 &&
      typeof ftsCount === 'number' &&
      ftsCount === 0
    ) {
      log('[web.writings] fts-rebuild-start reason=empty-index');
      await rebuildAllFts();
    }
  };

  const syncFull = async (onProgress: (progress: number) => void): Promise<void> => {
    onProgress(0);
    await options.database.close();
    await options.downloader.download('/api/db/egw', 'egw-paragraphs.db', onProgress);
    await options.database.open(SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE);
    await ensureEgwSchemaVersion();
    await options.database.exec(EGW_SCHEMA);

    await options.database.write(
      `INSERT OR REPLACE INTO sync_status (book_id, book_code, status, last_attempt, paragraph_count)
       SELECT book_id, book_code, 'success', ?, paragraph_count FROM books`,
      [new Date().toISOString()],
    );
    log('[web.writings] full-sync-status-ready source=books');

    await rebuildAllFts();
  };

  const autoSyncBibleCommentaries = async (callbacks: {
    readonly onProgress: (event: EgwBookProgress) => void;
    readonly onComplete: (bookCode: string, count: number) => void;
    readonly onError: (bookCode: string, error: unknown) => void;
  }): Promise<void> => {
    /* eslint-disable no-await-in-loop */
    for (const bookCode of BC_VOLUMES) {
      try {
        if (await isBookSynced(bookCode)) continue;
        log(`[web.writings] auto-sync-start book=${bookCode}`);
        const count = await syncBook(bookCode, callbacks.onProgress);
        if (count > 0) callbacks.onComplete(bookCode, count);
      } catch (error) {
        callbacks.onError(bookCode, error);
        const failureId = -(BC_VOLUMES.indexOf(bookCode) + 1);
        try {
          await options.database.write(
            `INSERT INTO sync_status (book_id, book_code, status, error_message, last_attempt, paragraph_count)
             VALUES (?, ?, 'failed', ?, ?, 0)
             ON CONFLICT(book_id) DO UPDATE SET
               status = 'failed',
               error_message = excluded.error_message,
               last_attempt = excluded.last_attempt`,
            [
              failureId,
              bookCode,
              error instanceof Error ? error.message : String(error),
              new Date().toISOString(),
            ],
          );
        } catch {
          // A status-write failure must not prevent the remaining volumes from syncing.
        }
      }
    }
    /* eslint-enable no-await-in-loop */
  };

  return {
    initialize,
    query: options.database.query,
    getBooks,
    getSyncStatus,
    syncBook,
    syncFull,
    autoSyncBibleCommentaries,
  };
};
