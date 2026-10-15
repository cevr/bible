import { BunServices } from '@effect/platform-bun';
import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Result } from 'effect';
import * as SqlClient from 'effect/sql/SqlClient';

import { SqlAtomic } from './atomic.js';

describe('SqlAtomic.layerTransaction', () => {
  const test = it.scopedLive.layer(BunServices.layer);
  const layer = Layer.fresh(
    SqlAtomic.layerTransaction.pipe(Layer.provideMerge(SqliteBun.layer({ filename: ':memory:' }))),
  );

  test('lands none of a group when one statement fails', () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const atomic = yield* SqlAtomic;
      yield* sql`CREATE TABLE items (id INTEGER PRIMARY KEY)`;
      yield* sql`INSERT INTO items (id) VALUES (1)`;

      const result = yield* Effect.result(
        atomic.run([
          sql`DELETE FROM items`,
          sql`INSERT INTO items (id) VALUES (2)`,
          sql`INSERT INTO items (id) VALUES (2)`,
        ]),
      );

      expect(Result.isFailure(result)).toBe(true);
      const rows = yield* sql<{ readonly id: number }>`SELECT id FROM items`;
      expect(rows.map((row) => row.id)).toEqual([1]);
    }).pipe(Effect.provide(layer)));

  test('lands every statement of a group in order', () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const atomic = yield* SqlAtomic;
      yield* sql`CREATE TABLE items (id INTEGER PRIMARY KEY)`;

      yield* atomic.run([
        sql`INSERT INTO items (id) VALUES (1)`,
        sql`INSERT INTO items (id) SELECT id + 1 FROM items`,
      ]);

      const rows = yield* sql<{ readonly id: number }>`SELECT id FROM items ORDER BY id`;
      expect(rows.map((row) => row.id)).toEqual([1, 2]);
    }).pipe(Effect.provide(layer)));
});
