// An id no other has, made where it is needed: a page's Undo or Redo request
// (`StepRequest.request`), a change in a film's history (`Change.id`). The
// time it was made and a random part, so two ids made by different processes,
// or by one across a restart, differ too.

import { Clock, Effect, Random } from 'effect';

/** A fresh id: the time it was made, and a random part, in base 36. */
export const uniqueId: Effect.Effect<string> = Effect.map(
  Effect.all([Clock.currentTimeMillis, Random.nextIntBetween(0, 2 ** 52)]),
  ([at, n]) => `${at.toString(36)}-${n.toString(36)}`,
);
