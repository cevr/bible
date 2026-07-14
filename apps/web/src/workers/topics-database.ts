import * as SQLite from 'wa-sqlite';

import type { DatabaseFileDownloader } from './database-file-downloader.js';
import type { SqliteDatabase, SqliteRow } from './sqlite-database.js';

export interface WorkerTopicsDatabase {
  readonly initialize: (onProgress: (progress: number) => void) => Promise<void>;
  readonly query: (sql: string, params?: readonly unknown[]) => Promise<readonly SqliteRow[]>;
}

/** Own the downloaded, read-only Topics database lifecycle. */
export const makeWorkerTopicsDatabase = (options: {
  readonly database: SqliteDatabase;
  readonly downloader: DatabaseFileDownloader;
}): WorkerTopicsDatabase => {
  const hasCatalog = async (): Promise<boolean> => {
    try {
      const rows = await options.database.query('SELECT COUNT(*) as cnt FROM topics');
      return typeof rows[0]?.['cnt'] === 'number' && rows[0]['cnt'] > 0;
    } catch {
      return false;
    }
  };

  const initialize = async (onProgress: (progress: number) => void): Promise<void> => {
    await options.database.open(SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE);
    if (await hasCatalog()) return;

    onProgress(0);
    await options.database.close();
    await options.downloader.download('/api/db/topics', 'topics.db', onProgress);
    await options.database.open(SQLite.SQLITE_OPEN_READONLY);
  };

  return {
    initialize,
    query: options.database.query,
  };
};
