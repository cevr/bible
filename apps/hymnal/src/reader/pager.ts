/**
 * The hymn pager's arithmetic: which hymns a swipe moves through, where it
 * opens, and which hymn a settled offset shows.
 *
 * A swipe moves through the list the reader came from: the home list, a
 * search's results, Favourites or Recent, as the row they pressed recorded it
 * (`place.ts`, `pageSource`). A hymn opened any other way (a deep link, the
 * now-playing bar) pages through every hymn in number order. The ends do
 * not wrap.
 */

import { Option } from 'effect';

/** The hymns a pager moves through, in order, and the place it opens at. */
export interface Pages {
  readonly list: ReadonlyArray<number>;
  readonly index: number;
}

/**
 * The pages for hymn `number`: the source list when it holds the hymn, else
 * every hymn (`all`, in number order).
 */
export const pageSource = (
  source: Option.Option<ReadonlyArray<number>>,
  number: number,
  all: ReadonlyArray<number>,
): Pages =>
  source.pipe(
    Option.filter((list) => list.includes(number)),
    Option.getOrElse(() => all),
    (list) => ({ list, index: Math.max(0, list.indexOf(number)) }),
  );

/** The hymn a pager of pages `width` wide shows once settled at `offset`; none for an empty list. */
export const settledAt = (
  offset: number,
  width: number,
  list: ReadonlyArray<number>,
): Option.Option<number> =>
  Option.fromUndefinedOr(
    list[Math.min(Math.max(Math.round(offset / Math.max(width, 1)), 0), list.length - 1)],
  );

/**
 * Whether `offset` rests on a page's edge, to half a point: a drag let go
 * there settles with no glide after it, so it is a settle of its own.
 */
export const onPage = (offset: number, width: number): boolean =>
  Math.abs(offset - Math.round(offset / Math.max(width, 1)) * width) <= 0.5;
