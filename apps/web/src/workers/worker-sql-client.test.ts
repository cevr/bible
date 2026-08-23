import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';

import { SqliteDatabaseError, type SqliteDatabase } from './sqlite-database.js';
import { layerWorkerSqlClient } from './worker-sql-client.js';

/** Run an effect against the adapter over one fixture connection. The layer is
 *  provided at this function's own boundary rather than inside a test's
 *  generator. */
const withSql = <A, E>(database: SqliteDatabase, ask: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  ask.pipe(Effect.provide(layerWorkerSqlClient(database)));

/** The reading fixture, plus the log of the statements it was handed: what the
 *  adapter chose to call, in the order it called it. */
interface RecordingDatabase {
  readonly database: SqliteDatabase;
  readonly calls: () => readonly string[];
}

const recordingDatabase = (): RecordingDatabase => {
  const calls: string[] = [];
  return {
    calls: () => calls,
    database: {
      isOpen: true,
      open: () => Effect.void,
      close: Effect.void,
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
    },
  };
};

/** A connection whose driver fails every read, so the error channel is the only
 *  thing the test can observe. */
const failingDatabase: SqliteDatabase = {
  isOpen: true,
  open: () => Effect.void,
  close: Effect.void,
  exec: () => Effect.void,
  write: () => Effect.succeed(0),
  query: () =>
    Effect.fail(
      SqliteDatabaseError.make({
        operation: 'query',
        filename: 'fixture.db',
        cause: 'database unavailable',
      }),
    ),
  values: () => Effect.succeed([]),
};

describe('worker Effect SQL adapter', () => {
  const recording = recordingDatabase();

  it.effect('executes named and positional reads on the owned SQLite connection', () =>
    Effect.gen(function* () {
      const result = yield* withSql(
        recording.database,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          const named = yield* sql.unsafe('SELECT value');
          const positional = yield* sql.unsafe('SELECT value').values;
          return { named, positional };
        }),
      );

      expect(result).toEqual({ named: [{ value: 42 }], positional: [[42]] });
      expect(recording.calls()).toEqual(['query:SELECT value', 'values:SELECT value']);
    }),
  );

  it.effect('maps driver failures into the standard SQL error channel', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        withSql(
          failingDatabase,
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient;
            return yield* sql.unsafe('SELECT value');
          }),
        ),
      );

      expect(exit._tag).toBe('Failure');
    }),
  );
});
