// An id no other has, made where it is needed: a page's Undo or Redo request
// (`RequestId`, `StepRequest.request`), a change in a film's history
// (`ChangeId`, `Change.id`), an approve run (`OpId`). The time it was made
// and a random part, so two ids made by different processes, or by one
// across a restart, differ too. Each kind is its own brand, made here or
// decoded where it arrives: a name, a time or another kind's id never stands
// in for one (`lab/identity.types.ts`).

import { Clock, Effect, Random } from 'effect';

/** A fresh id of the kind `brand` makes: the time it was made, and a random part, in base 36. */
export const uniqueId = <A>(brand: { readonly make: (id: string) => A }): Effect.Effect<A> =>
  Effect.map(Effect.all([Clock.currentTimeMillis, Random.nextIntBetween(0, 2 ** 52)]), ([at, n]) =>
    brand.make(`${at.toString(36)}-${n.toString(36)}`),
  );
