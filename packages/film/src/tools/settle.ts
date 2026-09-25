// Paid jobs run a few at a time and every one finishes: a failure never
// interrupts a take or a score already being generated. The run then fails
// with the first failure, after each job has saved what it made.

import { Array as Arr, Effect, Option } from 'effect';

export const settleAll = <A, B, E, R>(
  items: ReadonlyArray<A>,
  run: (item: A) => Effect.Effect<B, E, R>,
  concurrency: number,
): Effect.Effect<ReadonlyArray<B>, E, R> =>
  Effect.forEach(items, (item) => Effect.result(run(item)), { concurrency }).pipe(
    Effect.flatMap((results) =>
      Option.match(Arr.head(Arr.getFailures(results)), {
        onNone: () => Effect.succeed(Arr.getSuccesses(results)),
        onSome: (failure) => Effect.fail(failure),
      }),
    ),
  );
