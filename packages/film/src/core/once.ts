// One run of an effect, shared by every caller, owned by the scope that made
// it. The first caller starts the run in a fiber of the scope's; each caller
// joins it, so a caller interrupted while it waits leaves the run going for the
// next, and the run ends only with its scope.
//
// `Effect.cached` (effect 4.0.2) gives up a run once every caller has left and
// starts it again for the next one. That is safe for a run an interruption
// stops; a run nothing stops once begun (a WebAssembly engine's start, a
// promise with no signal) keeps going unseen, and the next caller starts a
// second one beside it.

import { Effect, Fiber, Option, type Scope, SynchronizedRef } from 'effect';

/** `self` run once, started by its first caller in a fiber the current scope owns, and joined by each caller. */
export const onceScoped = <A, E, R>(
  self: Effect.Effect<A, E, R>,
): Effect.Effect<Effect.Effect<A, E, R>, never, Scope.Scope> =>
  Effect.map(
    Effect.all([Effect.scope, SynchronizedRef.make(Option.none<Fiber.Fiber<A, E>>())]),
    ([scope, started]) =>
      Effect.flatMap(
        SynchronizedRef.modifyEffect(started, (current) =>
          Option.match(current, {
            onSome: (fiber) => Effect.succeed([fiber, current] as const),
            onNone: () =>
              Effect.map(
                Effect.forkIn(self, scope),
                (fiber) => [fiber, Option.some(fiber)] as const,
              ),
          }),
        ),
        Fiber.join,
      ),
  );
