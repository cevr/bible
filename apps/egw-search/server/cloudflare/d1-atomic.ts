/**
 * `SqlAtomic` over D1: a group of statements as one batch.
 *
 * D1 has no interactive transactions, so `D1Client` dies on
 * `withTransaction`. A batch is its atomic unit instead: the statements run
 * in order inside one transaction on the database, and a failure in any of
 * them rolls back all of them.
 */
import * as D1Client from '@effect/sql-d1/D1Client';
import { Effect, Layer } from 'effect';

import { SqlAtomic } from '@bible/core/egw-db';

export const D1Atomic: Layer.Layer<SqlAtomic, never, D1Client.D1Client> = Layer.effect(
  SqlAtomic,
  Effect.gen(function* () {
    const d1 = yield* D1Client.D1Client;
    return SqlAtomic.of({ run: (statements) => Effect.asVoid(d1.batch(statements)) });
  }),
);
