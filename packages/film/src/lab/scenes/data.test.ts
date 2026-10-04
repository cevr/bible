// A batch say on scenes goes a run of neighbours at a time: the project
// refuses scenes apart in one address, so the selection is cut where a
// scene between two picked ones is not picked, each run in film order
// whatever order the scenes were picked in.

import { describe, expect, test } from 'bun:test';
import { runsOf } from './data.ts';

const ORDER = ['a', 'b', 'c', 'd', 'e'];

describe('runsOf', () => {
  test('neighbours are one run; a gap starts the next', () => {
    expect(runsOf(['a', 'b', 'd'], ORDER)).toEqual([['a', 'b'], ['d']]);
    expect(runsOf(['b', 'c', 'd'], ORDER)).toEqual([['b', 'c', 'd']]);
  });

  test('the runs are in film order, whatever order the scenes were picked in', () => {
    expect(runsOf(['e', 'a', 'd'], ORDER)).toEqual([['a'], ['d', 'e']]);
  });

  test('a scene the film does not have is in no run, and nothing picked is no runs', () => {
    expect(runsOf(['x', 'c'], ORDER)).toEqual([['c']]);
    expect(runsOf([], ORDER)).toEqual([]);
  });
});
