import { Effect, Layer, Schema, Stream } from 'effect';
import * as Reactivity from 'effect/unstable/reactivity/Reactivity';
import * as SqlClient from 'effect/unstable/sql/SqlClient';
import type { Connection } from 'effect/unstable/sql/SqlConnection';
import { SqlError, UnknownError } from 'effect/unstable/sql/SqlError';
import * as Statement from 'effect/unstable/sql/Statement';

import { DbClientService, type DatabaseQueryError } from '../db-client-service';

const SqlRow = Schema.Record(Schema.String, Schema.Unknown);

const sqlError = (cause: DatabaseQueryError, operation: string): SqlError =>
  new SqlError({
    reason: new UnknownError({
      cause,
      message: 'The browser Bible database query failed',
      operation,
    }),
  });

const make = Effect.gen(function* () {
  const database = yield* DbClientService;

  const query = (sql: string, params: ReadonlyArray<unknown>, operation: string) =>
    database
      .query(SqlRow, 'bible', sql, params)
      .pipe(Effect.mapError((cause) => sqlError(cause, operation)));

  const execute = (
    sql: string,
    params: ReadonlyArray<unknown>,
    transformRows: (<A extends object>(rows: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined,
  ) =>
    query(sql, params, 'execute').pipe(
      Effect.map((rows) => (transformRows === undefined ? rows : transformRows(rows))),
    );

  const executeValues = (sql: string, params: ReadonlyArray<unknown>) =>
    query(sql, params, 'executeValues').pipe(
      Effect.map((rows) => rows.map((row) => Object.values(row))),
    );

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
    spanAttributes: [['db.system.name', 'sqlite-browser']],
  });
});

/** Effect SQL adapter for the read-only Bible database owned by the browser worker. */
export const layerBrowserBibleSqlClient: Layer.Layer<SqlClient.SqlClient, never, DbClientService> =
  Layer.effect(SqlClient.SqlClient, make).pipe(Layer.provide(Reactivity.layer));
