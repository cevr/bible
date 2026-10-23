/**
 * The reader's lists as plain values: Favourites toggled, Recent visited,
 * and Recent read as the home list's shelf against the hymns there are.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { RECENT, shelvesOf, toggleFavourite, visited } from './lists';

describe('toggleFavourite', () => {
  it('adds a hymn in number order, and removes it on a second toggle', () => {
    const marked = toggleFavourite(toggleFavourite([], 30), 3);
    expect(marked).toEqual([3, 30]);
    expect(toggleFavourite(marked, 30)).toEqual([3]);
  });
});

describe('visited', () => {
  it('puts the hymn first, with no repeats', () => {
    expect(visited([5, 3, 9], 3)).toEqual([3, 5, 9]);
  });

  it(`keeps at most ${RECENT}`, () => {
    const opened = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].reduce(visited, []);
    expect(opened).toEqual([10, 9, 8, 7, 6]);
  });
});

/** Hymns 1 to 695, each as its number. */
const hymnOf = (n: number) => Option.liftPredicate(n, (m) => m >= 1 && m <= 695);

describe('shelvesOf', () => {
  it('reads Recent alone, in its stored order: Favourites is no shelf, its hymns are starred in the rows', () => {
    expect(shelvesOf([30, 4], hymnOf)).toEqual([{ name: 'Recent', hymns: [30, 4] }]);
  });

  it('drops numbers no hymn has, keeping the order', () => {
    expect(shelvesOf([700, 3, 0, 5], hymnOf)).toEqual([{ name: 'Recent', hymns: [3, 5] }]);
    expect(shelvesOf([9999], hymnOf)).toEqual([{ name: 'Recent', hymns: [] }]);
  });
});
