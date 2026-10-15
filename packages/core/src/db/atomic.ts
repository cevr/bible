/**
 * A group of SQL statements that lands whole or not at all.
 *
 * Two hosts write the paragraph database, and they make a group atomic in
 * different ways. A SQLite file has interactive transactions: open one, run
 * the statements, commit. D1 has none — `D1Client` dies on
 * `withTransaction` — and offers a batch instead: the statements go to the
 * database together and run as one transaction there. A batch cannot read a
 * result and decide the next statement on it, so the group is a list of
 * statements fixed before it runs, which is the shape both hosts can honor.
 *
 * The capability is a service rather than a branch on the driver, so a host
 * that cannot make a group atomic does not compile against a writer that
 * needs one.
 */

import { Context, Effect, Layer } from 'effect';
import * as SqlClient from 'effect/sql/SqlClient';
import type { SqlError } from 'effect/sql/SqlError';
import type * as Statement from 'effect/sql/Statement';

interface SqlAtomicService {
  /** Runs `statements` in order, as one unit: all of them, or none. */
  readonly run: (
    statements: readonly Statement.Statement<unknown>[],
  ) => Effect.Effect<void, SqlError>;
}

export class SqlAtomic extends Context.Service<SqlAtomic, SqlAtomicService>()(
  '@bible/core/db/SqlAtomic',
) {
  /** The group as one interactive transaction, for a driver that has them. */
  static layerTransaction: Layer.Layer<SqlAtomic, never, SqlClient.SqlClient> = Layer.effect(
    SqlAtomic,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      return SqlAtomic.of({
        run: (statements) =>
          sql.withTransaction(
            Effect.forEach(statements, (statement) => statement, { discard: true }),
          ),
      });
    }),
  );
}
