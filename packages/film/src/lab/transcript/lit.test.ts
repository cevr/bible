// Words painted, pure: the ranges of the one text a run of words takes, a
// word given twice painted once.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { type Row, rangesOf } from './lit.ts';

/** A word at offset `from` of the one text. */
const row = (index: number, text: string, from: number): Row => ({
  index,
  text,
  struck: false,
  from,
  start: Option.none(),
});

// `Why um law? To`: Why 0-3, um 4-6, law? 7-11, To 12-14.
const why = row(0, 'Why', 0);
const um = row(1, 'um', 4);
const law = row(2, 'law?', 7);
const to = row(3, 'To', 12);

describe('words painted', () => {
  test('are one range for each run of them, in the text’s order, a word given twice once', () => {
    // Why and law? have um between them; law? and To are next to each other.
    expect(rangesOf([law, to, why, law])).toEqual([
      [0, 3],
      [7, 14],
    ]);
    expect(rangesOf([um, law])).toEqual([[4, 11]]);
    expect(rangesOf([um])).toEqual([[4, 6]]);
    expect(rangesOf([])).toEqual([]);
  });
});
