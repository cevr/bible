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
import { Effect } from 'effect';

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

const isPromiseLike = <A>(value: A | PromiseLike<A>): value is PromiseLike<A> =>
  typeof value === 'object' &&
  value !== null &&
  'then' in value &&
  typeof value.then === 'function';

export const makeBrowserUserDatabase = (input: BrowserUserDatabaseInput): BrowserUserDatabase => {
  const executeRemote = (
    sql: string,
    params: ReadonlyArray<unknown>,
    method: 'run' | 'all' | 'values' | 'get',
  ): Promise<SqliteRemoteResult> =>
    Effect.runPromise(
      Effect.gen(function* () {
        if (method === 'run') {
          yield* input.database.write(sql, params);
          return { rows: [] };
        }

        const rows = yield* input.database.values(sql, params);
        if (method === 'get') return { rows: rows[0] };
        return { rows: [...rows] };
      }),
    );

  // @ts-expect-error Drizzle beta requires rows even though SqliteRemoteResult and get() allow none.
  const db = drizzle(executeRemote, { schema: userStateSchema });

  const transaction: SqliteTransaction = {
    run: execute,
    all: execute,
    get: execute,
  };

  const runTransaction = <A>(
    operation: (scope: SqliteTransaction) => PromiseLike<A> | A,
  ): Promise<A> =>
    Effect.runPromise(
      Effect.suspend(() => {
        const result = operation(transaction);
        if (isPromiseLike(result)) return Effect.tryPromise(() => result);
        return Effect.succeed(result);
      }),
    );

  const adapter: SqliteBridgeAdapter = {
    run: execute,
    all: execute,
    get: execute,
    transaction: (operation) => db.transaction(() => runTransaction(operation)),
  };

  const bridge = makeSqliteEffectBridge(adapter);
  const migrate = (sql: string) =>
    bridge.transaction(() =>
      Effect.runPromise(
        Effect.forEach(
          makeInitialUserStateMigration(sql).statements,
          (statement) => input.database.write(statement),
          { concurrency: 1, discard: true },
        ),
      ),
    );

  return { drizzle: db, bridge, migrate };
};

export const makeBrowserSyncStore = (
  database: BrowserUserDatabase,
  localClientId: ClientId,
): SyncStore => makeDrizzleSyncStore(database, localClientId);
