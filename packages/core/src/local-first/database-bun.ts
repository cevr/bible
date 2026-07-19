import { Database } from 'bun:sqlite';
import { drizzle, type SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';
import { Effect, Layer } from 'effect';

import {
  makeSqliteEffectBridge,
  SqliteEffectBridge,
  type SqliteBridgeAdapter,
  type SqliteTransaction,
  type UserDatabaseError,
} from './database.js';
import { makeInitialUserStateMigration } from './migrations.js';
import { userStateSchema, type UserStateSchema } from './schema.js';

export { makeBunSyncStore } from './sync-store-bun.js';

export interface BunUserDatabase {
  readonly client: Database;
  readonly drizzle: SQLiteBunDatabase<UserStateSchema>;
  readonly bridge: ReturnType<typeof makeSqliteEffectBridge>;
  readonly migrate: (sql: string) => Effect.Effect<void, UserDatabaseError>;
  readonly close: Effect.Effect<void>;
}

const execute = <A>(operation: {
  readonly execute: () => PromiseLike<A> | A;
}): PromiseLike<A> | A => operation.execute();

export const makeBunUserDatabase = (filename = ':memory:'): BunUserDatabase => {
  const client = new Database(filename, { create: true, readwrite: true });
  client.run('PRAGMA foreign_keys = ON');
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
        scope.run({ execute: () => client.run(statement) });
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

export const layerBunUserDatabase = (filename = ':memory:'): Layer.Layer<SqliteEffectBridge> =>
  Layer.effect(SqliteEffectBridge)(
    Effect.acquireRelease(
      Effect.sync(() => makeBunUserDatabase(filename)),
      (database) => database.close,
    ).pipe(Effect.map((database) => database.bridge)),
  );
