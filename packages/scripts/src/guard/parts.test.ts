import { describe, expect, test } from 'bun:test';

import { partsOf, shareOf } from './parts.js';

describe('the parts a tool runs in', () => {
  test('deal the largest file first, each to the lightest part, and list each part sorted', () => {
    const files = [
      { name: 'a.ts', bytes: 10 },
      { name: 'b.ts', bytes: 70 },
      { name: 'c.ts', bytes: 30 },
      { name: 'd.ts', bytes: 40 },
      { name: 'e.ts', bytes: 20 },
    ];
    // b (70) → 1; d (40) → 2; c (30) → 2 (40 < 70) = 70; e (20) → 1 (tie, the first) = 90; a (10) → 2 = 80.
    expect(partsOf(files, 2)).toEqual([
      ['b.ts', 'e.ts'],
      ['a.ts', 'c.ts', 'd.ts'],
    ]);
  });

  test('leave out a part dealt nothing, and take at least one part', () => {
    const files = [{ name: 'only.ts', bytes: 5 }];
    expect(partsOf(files, 4)).toEqual([['only.ts']]);
    expect(partsOf(files, 0)).toEqual([['only.ts']]);
    expect(partsOf([], 3)).toEqual([]);
  });

  test('break a tie in size by name, so the deal never depends on the listing order', () => {
    const one = [
      { name: 'y.ts', bytes: 1 },
      { name: 'x.ts', bytes: 1 },
    ];
    expect(partsOf(one, 2)).toEqual(partsOf(one.toReversed(), 2));
    expect(partsOf(one, 2)).toEqual([['x.ts'], ['y.ts']]);
  });

  test('are a part per three cores, at most four, each with its share of the threads', () => {
    expect([1, 2, 3, 8, 12, 16, 64].map(shareOf)).toEqual([
      { parts: 1, threads: 1 },
      { parts: 1, threads: 2 },
      { parts: 1, threads: 3 },
      { parts: 2, threads: 4 },
      { parts: 4, threads: 3 },
      { parts: 4, threads: 4 },
      { parts: 4, threads: 16 },
    ]);
  });
});
