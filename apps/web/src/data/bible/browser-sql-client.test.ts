import { describe, expect, test } from 'bun:test';
import { Effect, Layer, Schema } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';

import { DatabaseQueryError, DbClientService } from '../db-client-service';
import { layerBrowserBibleSqlClient } from './browser-sql-client';

interface QueryCall {
  readonly database: 'bible' | 'state' | 'egw' | 'topics';
  readonly sql: string;
  readonly params: readonly unknown[];
}

const databaseLayer = (
  calls: QueryCall[],
  queryRows: (
    database: QueryCall['database'],
    sql: string,
    params: readonly unknown[],
  ) => Effect.Effect<readonly Record<string, unknown>[], DatabaseQueryError>,
) =>
  Layer.succeed(
    DbClientService,
    DbClientService.of({
      query: <T>(
        row: Schema.Decoder<T>,
        database: QueryCall['database'],
        sql: string,
        params: readonly unknown[] = [],
      ) => {
        calls.push({ database, sql, params });
        return queryRows(database, sql, params).pipe(
          Effect.flatMap((rows) =>
            Schema.decodeUnknownEffect(Schema.Array(row))(rows).pipe(
              Effect.mapError(
                (cause) => new DatabaseQueryError({ cause, operation: `test query(${database})` }),
              ),
            ),
          ),
          Effect.map((rows) => Array.from(rows)),
        );
      },
      exec: () => Effect.succeed(0),
      exportState: () => Effect.succeed(new ArrayBuffer(0)),
      isDirty: () => Effect.succeed(false),
      onExec: () => undefined,
      initializeTopics: () => Effect.void,
      syncWritingsPublication: () => Effect.succeed(0),
      getWritingsSyncStatus: () => Effect.succeed([]),
      syncAllWritings: () => Effect.void,
      onWritingsSyncComplete: () => () => undefined,
    }),
  );

const run = <A, E>(
  effect: Effect.Effect<A, E, SqlClient.SqlClient>,
  database: Layer.Layer<DbClientService>,
): Promise<A> =>
  Effect.runPromise(
    effect.pipe(Effect.provide(layerBrowserBibleSqlClient.pipe(Layer.provide(database)))),
  );

describe('browser Bible SQL adapter', () => {
  test('compiles Effect SQLite statements and decodes worker rows', async () => {
    const calls: QueryCall[] = [];
    const layer = databaseLayer(calls, () =>
      Effect.succeed([{ book: 1, chapter: 1, verse: 1, text: 'In the beginning' }]),
    );

    const rows = await run(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql<{
          readonly book: number;
          readonly chapter: number;
          readonly verse: number;
          readonly text: string;
        }>`
          SELECT book, chapter, verse, text
          FROM verses
          WHERE book = ${1} AND ${sql.in('verse', [1, 2])}
        `;
      }),
      layer,
    );

    expect(rows).toEqual([{ book: 1, chapter: 1, verse: 1, text: 'In the beginning' }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.database).toBe('bible');
    expect(calls[0]?.sql).toContain('"verse" IN (?,?)');
    expect(calls[0]?.params).toEqual([1, 1, 2]);
  });

  test('maps worker failures into the standard SQL error channel', async () => {
    const calls: QueryCall[] = [];
    const workerError = new DatabaseQueryError({
      cause: new Error('worker unavailable'),
      operation: 'query(bible)',
    });
    const layer = databaseLayer(calls, () => Effect.fail(workerError));

    const result = await run(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* Effect.result(sql`SELECT 1`);
      }),
      layer,
    );

    expect(result._tag).toBe('Failure');
    if (result._tag === 'Failure') {
      expect(result.failure._tag).toBe('SqlError');
      expect(result.failure.reason._tag).toBe('UnknownError');
      expect(result.failure.reason.cause).toBe(workerError);
    }
  });
});
