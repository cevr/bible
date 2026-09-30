import { Effect, Layer, Predicate, Stream } from 'effect';
import * as Reactivity from 'effect/reactivity/Reactivity';
import * as SqlClient from 'effect/sql/SqlClient';
import type { Connection } from 'effect/sql/SqlConnection';
import { SqlError, UnknownError } from 'effect/sql/SqlError';
import * as Statement from 'effect/sql/Statement';

import type { SqliteDatabase } from './sqlite-database.js';

const sqlError = (cause: unknown, operation: string): SqlError =>
  SqlError.make({
    reason: UnknownError.make({
      cause,
      message: 'The worker SQLite query failed',
      operation,
    }),
  });

const make = (database: SqliteDatabase) =>
  Effect.gen(function* () {
    const query = (sql: string, params: ReadonlyArray<unknown>, operation: string) =>
      database.query(sql, params).pipe(Effect.mapError((cause) => sqlError(cause, operation)));

    const execute = (
      sql: string,
      params: ReadonlyArray<unknown>,
      transformRows?: <A extends object>(rows: ReadonlyArray<A>) => ReadonlyArray<A>,
    ) =>
      query(sql, params, 'execute').pipe(
        Effect.map((rows) => {
          if (Predicate.isUndefined(transformRows)) return rows;
          return transformRows(rows);
        }),
      );

    const executeValues = (sql: string, params: ReadonlyArray<unknown>) =>
      database
        .values(sql, params)
        .pipe(Effect.mapError((cause) => sqlError(cause, 'executeValues')));

    const connection: Connection = {
      execute,
      executeRaw: (sql, params) => query(sql, params, 'executeRaw'),
      executeStream: (sql, params, transformRows) =>
        Stream.fromIterableEffect(execute(sql, params, transformRows)),
      executeValues,
      executeValuesUnprepared: executeValues,
      executeUnprepared: execute,
    };

    return yield* SqlClient.make({
      acquirer: Effect.succeed(connection),
      compiler: Statement.makeCompilerSqlite(),
      spanAttributes: [['db.system.name', 'sqlite-worker']],
    });
  });

export const layerWorkerSqlClient = (database: SqliteDatabase): Layer.Layer<SqlClient.SqlClient> =>
  Layer.effect(SqlClient.SqlClient, make(database)).pipe(Layer.provide(Reactivity.layer));
