/**
 * The list's database on Cloudflare: the Worker's D1 binding (`../worker/Site.ts`)
 * behind the store's port (`./sql.ts`). Only the parts of D1 the port needs
 * are named, so the tests' SQLite and D1 answer the same calls.
 */
import { Effect, Layer } from 'effect';

import { batchName, reasonOf, Sql, SqlError, type Statement, type SqlValue } from './sql.ts';

/** What a write answers: how many rows it changed. */
interface D1Written {
  readonly meta: { readonly changes: number };
}

/** A statement with its values bound, as D1 prepares it. */
export interface D1Bound {
  readonly all: () => Promise<{ readonly results: ReadonlyArray<unknown> }>;
  readonly run: () => Promise<D1Written>;
}

/** The part of a D1 binding the store calls; `batch` runs its statements in one transaction. */
export interface D1Like<B extends D1Bound> {
  readonly prepare: (query: string) => {
    readonly bind: (...values: Array<SqlValue>) => B;
  };
  readonly batch: (statements: Array<B>) => Promise<ReadonlyArray<D1Written>>;
}

export const layerD1 = <B extends D1Bound>(db: D1Like<B>) => {
  const attempt = <A>(name: string, run: () => Promise<A>) =>
    Effect.tryPromise({
      try: run,
      catch: (cause) => SqlError.make({ statement: name, reason: reasonOf(cause) }),
    });
  const prepared = (statement: Statement, values: ReadonlyArray<SqlValue>) =>
    db.prepare(statement.text).bind(...values);
  return Layer.succeed(
    Sql,
    Sql.of({
      all: (statement, values) =>
        attempt(statement.name, () => prepared(statement, values).all()).pipe(
          Effect.map((result) => result.results),
        ),
      run: (statement, values) =>
        attempt(statement.name, () => prepared(statement, values).run()).pipe(
          Effect.map((result) => result.meta.changes),
        ),
      batch: (steps) =>
        attempt(batchName(steps), () =>
          db.batch(steps.map((step) => prepared(step.statement, step.values))),
        ).pipe(Effect.map((results) => results.map((result) => result.meta.changes))),
    }),
  );
};
