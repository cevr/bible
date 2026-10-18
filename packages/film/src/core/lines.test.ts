// The lines of a text: a line starts after each newline, and an offset is on
// the line it falls in, as the server counts them.

import { describe, expect, test } from 'bun:test';
import { lineOf, lineStarts } from './lines.ts';

describe('the lines of a text', () => {
  test('a line starts after each newline, and an offset is on the line it falls in', () => {
    const starts = lineStarts('a\nbc\n\nd');
    expect(starts).toEqual([0, 2, 5, 6]);
    expect([0, 1, 2, 4, 5, 6, 7].map((o) => lineOf(starts, o))).toEqual([1, 1, 2, 2, 3, 4, 4]);
  });

  test('an offset is on the line a count of the newlines before it says', () => {
    for (const text of [
      'one\n\ntwo three\nfour\n',
      'a\r\nb\r\n\r\nc',
      'last has none',
      '\n\n',
      '',
    ]) {
      const starts = lineStarts(text);
      for (let at = 0; at <= text.length; at += 1)
        expect(lineOf(starts, at)).toBe(text.slice(0, at).split('\n').length);
    }
  });

  test("a line's newline is its own, a carriage return is its text, and the last line needs none", () => {
    const starts = lineStarts('ab\r\ncd');
    expect(starts).toEqual([0, 4]);
    // `\r` at 2 and `\n` at 3 end line 1; line 2 runs to the end, unterminated.
    expect([2, 3, 4, 6].map((o) => lineOf(starts, o))).toEqual([1, 1, 2, 2]);
    expect(lineOf(starts, -1)).toBe(1);
  });
});
