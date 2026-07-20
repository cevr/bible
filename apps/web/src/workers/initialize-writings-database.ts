import { EGWParagraphDatabase } from '@bible/core/egw-db';
import { Effect, Layer } from 'effect';
import * as SQLite from 'wa-sqlite';

import type { SqliteDatabase } from './sqlite-database.js';
import { layerWorkerSqlClient } from './worker-sql-client.js';

export const initializeWritingsDatabase = (database: SqliteDatabase): Promise<void> =>
  database.open(SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE).then(() =>
    Effect.runPromise(
      Effect.gen(function* () {
        yield* EGWParagraphDatabase;
      }).pipe(
        Effect.provide(
          EGWParagraphDatabase.layerCore.pipe(
            Layer.provide(layerWorkerSqlClient(database)),
            Layer.orDie,
          ),
        ),
      ),
    ),
  );
