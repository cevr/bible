/**
 * The pager's arithmetic: the pages a hymn opens among, and the hymn a
 * settled offset shows.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { pageSource, settledAt } from './pager';

const all = Array.from({ length: 695 }, (_, i) => i + 1);

describe('pageSource', () => {
  it('opens among the list the reader came from, at the hymn', () => {
    expect(pageSource(Option.some([30, 3, 13]), 3, all)).toEqual({ list: [30, 3, 13], index: 1 });
  });

  it('pages through every hymn when the hymn is not in the source', () => {
    expect(pageSource(Option.some([30, 13]), 600, all)).toEqual({ list: all, index: 599 });
  });

  it('pages through every hymn with no source, as from a deep link', () => {
    expect(pageSource(Option.none(), 1, all)).toEqual({ list: all, index: 0 });
  });
});

describe('settledAt', () => {
  const list = [30, 3, 13];

  it('names the hymn of the page the offset settled on', () => {
    expect(settledAt(0, 402, list)).toEqual(Option.some(30));
    expect(settledAt(402, 402, list)).toEqual(Option.some(3));
    expect(settledAt(803.6, 402, list)).toEqual(Option.some(13));
  });

  it('holds at the ends and never wraps', () => {
    expect(settledAt(-80, 402, list)).toEqual(Option.some(30));
    expect(settledAt(402 * 3 + 80, 402, list)).toEqual(Option.some(13));
  });

  it('names nothing for an empty list', () => {
    expect(settledAt(0, 402, [])).toEqual(Option.none());
  });
});
