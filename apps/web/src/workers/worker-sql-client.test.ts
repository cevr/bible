import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';

import { SqliteDatabaseError, type SqliteDatabase } from './sqlite-database.js';
import { layerWorkerSqlClient } from './worker-sql-client.js';

describe('worker Effect SQL adapter', () => {
  it.effect('executes named and positional reads on the owned SQLite connection', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const database: SqliteDatabase = {
        isOpen: true,
        open: () => Effect.void,
        close: () => Effect.void,
        exec: () => Effect.void,
        write: () => Effect.succeed(0),
        query: (sql) =>
          Effect.sync(() => {
            calls.push(`query:${sql}`);
            return [{ value: 42 }];
          }),
        values: (sql) =>
          Effect.sync(() => {
            calls.push(`values:${sql}`);
            return [[42]];
          }),
      };

      const result = yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const named = yield* sql.unsafe('SELECT value');
        const positional = yield* sql.unsafe('SELECT value').values;
        return { named, positional };
      }).pipe(Effect.provide(layerWorkerSqlClient(database)));

      expect(result).toEqual({ named: [{ value: 42 }], positional: [[42]] });
      expect(calls).toEqual(['query:SELECT value', 'values:SELECT value']);
    }),
  );

  it.effect('maps driver failures into the standard SQL error channel', () =>
    Effect.gen(function* () {
      const database: SqliteDatabase = {
        isOpen: true,
        open: () => Effect.void,
        close: () => Effect.void,
        exec: () => Effect.void,
        write: () => Effect.succeed(0),
        query: () =>
          Effect.fail(
            new SqliteDatabaseError({
              operation: 'query',
              filename: 'fixture.db',
              cause: 'database unavailable',
            }),
          ),
        values: () => Effect.succeed([]),
      };

      const exit = yield* Effect.exit(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          return yield* sql.unsafe('SELECT value');
        }).pipe(Effect.provide(layerWorkerSqlClient(database))),
      );

      expect(exit._tag).toBe('Failure');
    }),
  );
});
