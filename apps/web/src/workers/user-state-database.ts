import {
  makeInitialUserStateMigration,
  makeDrizzleSyncStore,
  makeSqliteEffectBridge,
  type SqliteBridgeAdapter,
  type SqliteTransaction,
  type UserDatabaseError,
  type ClientId,
  type SyncStore,
  userStateSchema,
  type UserStateSchema,
} from '@bible/core/local-first';
import {
  drizzle,
  type SqliteRemoteDatabase,
  type SqliteRemoteResult,
} from 'drizzle-orm/sqlite-proxy';
import type { Effect } from 'effect';

import type { SqliteDatabase } from './sqlite-database.js';

export interface BrowserUserDatabase {
  readonly drizzle: SqliteRemoteDatabase<UserStateSchema>;
  readonly bridge: ReturnType<typeof makeSqliteEffectBridge>;
  readonly migrate: (sql: string) => Effect.Effect<void, UserDatabaseError>;
}

export interface BrowserUserDatabaseInput {
  readonly database: SqliteDatabase;
}

const execute = <A>(operation: {
  readonly execute: () => PromiseLike<A> | A;
}): PromiseLike<A> | A => operation.execute();

export const makeBrowserUserDatabase = (input: BrowserUserDatabaseInput): BrowserUserDatabase => {
  const executeRemote = async (
    sql: string,
    params: ReadonlyArray<unknown>,
    method: 'run' | 'all' | 'values' | 'get',
  ): Promise<SqliteRemoteResult> => {
    if (method === 'run') {
      await input.database.write(sql, params);
      return { rows: [] };
    }

    const rows = await input.database.values(sql, params);
    if (method === 'get') return { rows: rows[0] };
    return { rows: [...rows] };
  };

  // @ts-expect-error Drizzle beta requires rows even though SqliteRemoteResult and get() allow none.
  const db = drizzle(executeRemote, { schema: userStateSchema });

  const transaction: SqliteTransaction = {
    run: execute,
    all: execute,
    get: execute,
  };

  const adapter: SqliteBridgeAdapter = {
    run: execute,
    all: execute,
    get: execute,
    transaction: (operation) => db.transaction(async () => operation(transaction)),
  };

  const bridge = makeSqliteEffectBridge(adapter);
  const migrate = (sql: string) =>
    bridge.transaction(async (scope) => {
      for (const statement of makeInitialUserStateMigration(sql).statements) {
        // eslint-disable-next-line no-await-in-loop -- migration statements are ordered
        await scope.run({ execute: () => input.database.write(statement) });
      }
    });

  return { drizzle: db, bridge, migrate };
};

export const makeBrowserSyncStore = (
  database: BrowserUserDatabase,
  localClientId: ClientId,
): SyncStore => makeDrizzleSyncStore(database, localClientId);
