/**
 * The reader's lists as plain values: Favourites toggled, Recent visited,
 * a stored list read against the hymns there are.
 */

import { describe, expect, it } from 'bun:test';

import { known, RECENT, toggleFavourite, visited } from './lists';

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
    expect(opened).toEqual([10, 9, 8, 7, 6, 5, 4, 3]);
  });
});

describe('known', () => {
  it('drops numbers no hymn has, keeping the order', () => {
    expect(known([700, 3, 0, 5], (n) => n >= 1 && n <= 695)).toEqual([3, 5]);
  });
});
