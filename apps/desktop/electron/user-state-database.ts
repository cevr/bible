import {
  makeDrizzleSyncStore,
  makeInitialUserStateMigration,
  makeSqliteEffectBridge,
  type ClientId,
  type SqliteBridgeAdapter,
  type SqliteTransaction,
  type SyncStore,
  type UserDatabaseError,
  userStateSchema,
  type UserStateSchema,
} from '@bible/core/local-first';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { Effect } from 'effect';

export interface DesktopUserDatabase {
  readonly client: Database.Database;
  readonly drizzle: BetterSQLite3Database<UserStateSchema>;
  readonly bridge: ReturnType<typeof makeSqliteEffectBridge>;
  readonly migrate: (sql: string) => Effect.Effect<void, UserDatabaseError>;
  readonly close: Effect.Effect<void>;
}

const execute = <A>(operation: {
  readonly execute: () => PromiseLike<A> | A;
}): PromiseLike<A> | A => operation.execute();

export const makeDesktopUserDatabase = (filename = ':memory:'): DesktopUserDatabase => {
  const client = new Database(filename);
  client.pragma('foreign_keys = ON');
  const db = drizzle({ client, schema: userStateSchema });

  const transaction: SqliteTransaction = {
    run: execute,
    all: execute,
    get: execute,
  };
  const adapter: SqliteBridgeAdapter = {
    run: execute,
    all: execute,
    get: execute,
    transaction: (operation) => client.transaction(() => operation(transaction))(),
  };
  const bridge = makeSqliteEffectBridge(adapter);
  const migrate = (sql: string) =>
    bridge.transaction((scope) => {
      for (const statement of makeInitialUserStateMigration(sql).statements) {
        scope.run({ execute: () => client.exec(statement) });
      }
    });

  return {
    client,
    drizzle: db,
    bridge,
    migrate,
    close: Effect.sync(() => client.close()),
  };
};

export const makeDesktopSyncStore = (
  database: DesktopUserDatabase,
  localClientId: ClientId,
): SyncStore => makeDrizzleSyncStore(database, localClientId);
