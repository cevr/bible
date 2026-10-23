/**
 * The reader's own lists: Favourites, the hymns they marked, and Recent,
 * the hymns they last opened. Each is a list of hymn numbers kept as a
 * `lists.*` setting (`src/settings.ts`), apart from the hymn text. A
 * number is a hymn's identity; a stored number no hymn has is dropped as the
 * list is read (`recentOf`, `shelvesOf`). Recent keeps the latest `RECENT`
 * hymns; the home list shows its latest `RECENT_SHOWN` as a shelf above the
 * topics, under a header that opens the Recent screen with all of them
 * (`/recent`). Each favourite is marked with a star in its rows (`rows.ts`)
 * rather than in a shelf of its own.
 */

import { Array as Arr, Match, type Option, Schema } from 'effect';

/** A stored list of hymn numbers. */
export const Numbers = Schema.Array(Schema.Int);

/** How many hymns Recent keeps. */
export const RECENT = 50;

/** How many of Recent's hymns the home list shows. */
export const RECENT_SHOWN = 5;

/** Favourites with hymn `n` added, in number order, or removed when it was there. */
export const toggleFavourite = (list: ReadonlyArray<number>, n: number): ReadonlyArray<number> =>
  Match.value(list.includes(n)).pipe(
    Match.when(true, () => list.filter((m) => m !== n)),
    Match.orElse(() => [...list, n].toSorted((a, b) => a - b)),
  );

/** Recent once hymn `n` is opened: it first, no repeats, at most `RECENT`. */
export const visited = (recent: ReadonlyArray<number>, n: number): ReadonlyArray<number> =>
  [n, ...recent.filter((m) => m !== n)].slice(0, RECENT);

/**
 * One of the reader's lists as the home list shows it: its name, the hymns
 * it shows, in its order, and the screen its header opens with all of them.
 */
export interface Shelf<Hymn> {
  readonly name: string;
  readonly hymns: ReadonlyArray<Hymn>;
  readonly href: string;
}

/** Every hymn Recent keeps, the latest first: the hymns its numbers name, a number no hymn has dropped. */
export const recentOf = <Hymn>(
  recent: ReadonlyArray<number>,
  hymnOf: (n: number) => Option.Option<Hymn>,
): ReadonlyArray<Hymn> => Arr.getSomes(recent.map(hymnOf));

/** The home list's shelves: Recent alone, its latest `RECENT_SHOWN` hymns, its header opening `/recent`. */
export const shelvesOf = <Hymn>(
  recent: ReadonlyArray<number>,
  hymnOf: (n: number) => Option.Option<Hymn>,
): ReadonlyArray<Shelf<Hymn>> => [
  { name: 'Recent', hymns: recentOf(recent, hymnOf).slice(0, RECENT_SHOWN), href: '/recent' },
];
