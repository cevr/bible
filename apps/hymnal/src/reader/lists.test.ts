/**
 * The reader's lists as plain values: Favourites toggled, Recent visited,
 * and Recent read against the hymns there are, as the home list's shelf
 * (its latest few) and as the Recent screen's list (all it keeps).
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { RECENT, RECENT_SHOWN, recentOf, shelvesOf, toggleFavourite, visited } from './lists';

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

  it(`keeps at most ${RECENT}, the latest first`, () => {
    const opened = Array.from({ length: 60 }, (_, i) => i + 1).reduce(visited, []);
    expect(RECENT).toBe(50);
    expect(opened).toEqual(Array.from({ length: 50 }, (_, i) => 60 - i));
  });
});

/** Hymns 1 to 695, each as its number. */
const hymnOf = (n: number) => Option.liftPredicate(n, (m) => m >= 1 && m <= 695);

describe('shelvesOf', () => {
  it('reads Recent alone, in its stored order, its header opening the Recent screen: Favourites is no shelf, its hymns are starred in the rows', () => {
    expect(shelvesOf([30, 4], hymnOf)).toEqual([
      { name: 'Recent', hymns: [30, 4], href: '/recent' },
    ]);
  });

  it(`shows the latest ${RECENT_SHOWN} of a longer Recent`, () => {
    expect(RECENT_SHOWN).toBe(5);
    expect(shelvesOf([7, 6, 5, 4, 3, 2, 1], hymnOf)).toEqual([
      { name: 'Recent', hymns: [7, 6, 5, 4, 3], href: '/recent' },
    ]);
  });

  it('drops numbers no hymn has, keeping the order, before it takes the latest', () => {
    expect(shelvesOf([700, 3, 0, 5], hymnOf)).toEqual([
      { name: 'Recent', hymns: [3, 5], href: '/recent' },
    ]);
    expect(shelvesOf([1, 700, 2, 3, 4, 0, 5, 6], hymnOf)[0]?.hymns).toEqual([1, 2, 3, 4, 5]);
    expect(shelvesOf([9999], hymnOf)).toEqual([{ name: 'Recent', hymns: [], href: '/recent' }]);
  });
});

describe('recentOf', () => {
  it('reads all Recent keeps, in its stored order, dropping numbers no hymn has', () => {
    const kept = Array.from({ length: 50 }, (_, i) => 50 - i);
    expect(recentOf(kept, hymnOf)).toEqual(kept);
    expect(recentOf([700, 3, 0, 5, 9999], hymnOf)).toEqual([3, 5]);
    expect(recentOf([], hymnOf)).toEqual([]);
  });
});
