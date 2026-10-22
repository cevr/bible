/**
 * The reader's own lists: Favourites, the hymns they marked, and Recent,
 * the hymns they last opened. Each is a list of hymn numbers kept as a
 * `lists.*` setting (`src/settings.ts`), apart from the hymn text. A
 * number is a hymn's identity; a stored number no hymn has is dropped as the
 * list is read.
 */

import { Match, Schema } from 'effect';

/** A stored list of hymn numbers. */
export const Numbers = Schema.Array(Schema.Int);

/** How many hymns Recent keeps. */
export const RECENT = 8;

/** Favourites with hymn `n` added, in number order, or removed when it was there. */
export const toggleFavourite = (list: ReadonlyArray<number>, n: number): ReadonlyArray<number> =>
  Match.value(list.includes(n)).pipe(
    Match.when(true, () => list.filter((m) => m !== n)),
    Match.orElse(() => [...list, n].toSorted((a, b) => a - b)),
  );

/** Recent once hymn `n` is opened: it first, no repeats, at most `RECENT`. */
export const visited = (recent: ReadonlyArray<number>, n: number): ReadonlyArray<number> =>
  [n, ...recent.filter((m) => m !== n)].slice(0, RECENT);

/** The numbers of `list` a hymn has, in the list's order. */
export const known = (list: ReadonlyArray<number>, has: (n: number) => boolean) => list.filter(has);
