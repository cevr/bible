/**
 * The list's database on Cloudflare: the Worker's D1 binding (`../worker/Site.ts`)
 * behind the store's port (`./sql.ts`). Only the parts of D1 the port needs
 * are named, so the tests' SQLite and D1 answer the same calls.
 */
import { Effect, Layer } from 'effect';

import { reasonOf, Sql, SqlError, type Statement, type SqlValue } from './sql.ts';

/** The part of a D1 binding the store calls. */
export interface D1Like {
  readonly prepare: (query: string) => {
    readonly bind: (...values: Array<SqlValue>) => {
      readonly all: () => Promise<{ readonly results: ReadonlyArray<unknown> }>;
      readonly run: () => Promise<{ readonly meta: { readonly changes: number } }>;
    };
  };
}

export const layerD1 = (db: D1Like) => {
  const attempt = <A>(statement: Statement, run: () => Promise<A>) =>
    Effect.tryPromise({
      try: run,
      catch: (cause) => SqlError.make({ statement: statement.name, reason: reasonOf(cause) }),
    });
  const prepared = (statement: Statement, values: ReadonlyArray<SqlValue>) =>
    db.prepare(statement.text).bind(...values);
  return Layer.succeed(
    Sql,
    Sql.of({
      all: (statement, values) =>
        attempt(statement, () => prepared(statement, values).all()).pipe(
          Effect.map((result) => result.results),
        ),
      run: (statement, values) =>
        attempt(statement, () => prepared(statement, values).run()).pipe(
          Effect.map((result) => result.meta.changes),
        ),
    }),
  );
};
