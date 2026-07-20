import { EGWParagraphDatabase } from '@bible/core/egw-db';
import { PublicationArchiveJson, type PublicationArchive } from '@bible/core/writings';
import { Effect, Layer, ManagedRuntime, Schema } from 'effect';
import * as SQLite from 'wa-sqlite';

import type { DatabaseFileDownloader } from './database-file-downloader.js';
import type { SqliteDatabase, SqliteRow } from './sqlite-database.js';
import { layerWorkerSqlClient } from './worker-sql-client.js';

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

const BC_VOLUMES = ['1BC', '2BC', '3BC', '4BC', '5BC', '6BC', '7BC'];

export const makeWorkerEgwDatabase = (options: {
  readonly database: SqliteDatabase;
  readonly downloader: DatabaseFileDownloader;
  readonly fetch?: (url: string) => Promise<Response>;
  readonly log?: (line: string) => void;
  readonly corpus?: {
    readonly initialize: () => Promise<void>;
    readonly install: (archive: PublicationArchive) => Promise<number>;
  };
}): WorkerEgwDatabase => {
  const fetchResponse = options.fetch ?? globalThis.fetch;
  const log = options.log ?? (() => {});

  const runtime = ManagedRuntime.make(
    EGWParagraphDatabase.layerCore.pipe(
      Layer.provide(layerWorkerSqlClient(options.database)),
      Layer.orDie,
    ),
  );
  const corpus = options.corpus ?? {
    initialize: () =>
      runtime.runPromise(
        Effect.gen(function* () {
          yield* EGWParagraphDatabase;
        }),
      ),
    install: (archive: PublicationArchive) =>
      runtime.runPromise(
        Effect.gen(function* () {
          const database = yield* EGWParagraphDatabase;
          return yield* database.installPublicationArchive(archive);
        }),
      ),
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
    const archive = await Schema.decodeUnknownPromise(PublicationArchiveJson)(
      await response.json(),
    );
    onProgress({ bookCode, stage: 'Installing...', progress: 50 });
    const installed = await corpus.install(archive);

    onProgress({ bookCode, stage: 'Done', progress: 100 });
    log(`[web.writings] sync-complete book=${bookCode} paragraphs=${String(installed)}`);
    return installed;
  };

  const initialize = async (): Promise<void> => {
    await options.database.open(SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE);
    await corpus.initialize();
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
    await corpus.initialize();

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
