// A walk through things placed in time, as a key steps it: the next one
// past the time shown, or the previous one before it, each a frame's width
// clear of it so a step from a thing never lands on the same thing. The
// cue edges (`.`/`,`), the notes (⇧N/⌥⇧N) and the findings (F/⇧F) walk
// this way. Pure.

import { Option } from 'effect';

/** Which way a walk goes. */
export type Toward = 'next' | 'previous';

/** How near a time counts as on it: a frame at 60 fps. */
const AT = 1 / 60;

/** The first of `items` (in time order by `timeOf`) past `T` toward `toward`, if there is one. */
export const walkFrom = <A>(
  items: ReadonlyArray<A>,
  timeOf: (item: A) => number,
  T: number,
  toward: Toward,
): Option.Option<A> => {
  const inOrder = items.toSorted((a, b) => timeOf(a) - timeOf(b));
  return Option.fromUndefinedOr(
    {
      next: () => inOrder.find((item) => timeOf(item) > T + AT),
      previous: () => inOrder.findLast((item) => timeOf(item) < T - AT),
    }[toward](),
  );
};
