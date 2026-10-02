/**
 * Entry keys: `<epoch ms>-<n>`, unique across loads of one tab, so a key a
 * reload restores never collides with one this load makes. The count lives in
 * the layer that made the generator, never in the module.
 */

import { Clock, Effect, Ref } from 'effect';

/** A generator of fresh entry keys, counting from 1. */
export const makeEntryKeys: Effect.Effect<Effect.Effect<string>> = Effect.map(
  Ref.make(0),
  (count) =>
    Effect.gen(function* () {
      const n = yield* Ref.updateAndGet(count, (value) => value + 1);
      const now = yield* Clock.currentTimeMillis;
      return `${String(now)}-${String(n)}`;
    }),
);
