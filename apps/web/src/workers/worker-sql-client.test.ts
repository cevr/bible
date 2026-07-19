import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';

import type { SqliteDatabase } from './sqlite-database.js';
import { layerWorkerSqlClient } from './worker-sql-client.js';

describe('worker Effect SQL adapter', () => {
  test('executes named and positional reads on the owned SQLite connection', async () => {
    const calls: string[] = [];
    const database: SqliteDatabase = {
      isOpen: true,
      open: () => Promise.resolve(),
      close: () => Promise.resolve(),
      exec: () => Promise.resolve(),
      write: () => Promise.resolve(0),
      query: (sql) => {
        calls.push(`query:${sql}`);
        return Promise.resolve([{ value: 42 }]);
      },
      values: (sql) => {
        calls.push(`values:${sql}`);
        return Promise.resolve([[42]]);
      },
    };

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const named = yield* sql.unsafe('SELECT value');
        const positional = yield* sql.unsafe('SELECT value').values;
        return { named, positional };
      }).pipe(Effect.provide(layerWorkerSqlClient(database))),
    );

    expect(result).toEqual({ named: [{ value: 42 }], positional: [[42]] });
    expect(calls).toEqual(['query:SELECT value', 'values:SELECT value']);
  });

  test('maps driver failures into the standard SQL error channel', async () => {
    const database: SqliteDatabase = {
      isOpen: true,
      open: () => Promise.resolve(),
      close: () => Promise.resolve(),
      exec: () => Promise.resolve(),
      write: () => Promise.resolve(0),
      query: () => Promise.reject(new Error('database unavailable')),
      values: () => Promise.resolve([]),
    };

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql.unsafe('SELECT value');
      }).pipe(Effect.provide(layerWorkerSqlClient(database))),
    );

    expect(exit._tag).toBe('Failure');
  });
});
