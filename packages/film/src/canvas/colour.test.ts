// Colours as a film writes them, hex: a colour between two, and its own
// clear shade; a colour that is not `#rgb` or `#rrggbb` is refused, named,
// never turned into a NaN fill a canvas ignores or a stop it refuses.

import { describe, expect, test } from 'bun:test';
import { clearOf, mix } from './colour.ts';

describe('mix', () => {
  test('a colour between two, rounded per channel, clamped to the two', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#ab8163', '#f3ebdd', 0)).toBe('#ab8163');
    expect(mix('#ab8163', '#f3ebdd', 2)).toBe('#f3ebdd');
    expect(mix('#fff', '#000', 0.25)).toBe('#bfbfbf');
  });
});

describe('clearOf', () => {
  test('the same colour at alpha 0', () => {
    expect(clearOf('#e6b347')).toBe('rgba(230, 179, 71, 0)');
    expect(clearOf('#fb0')).toBe('rgba(255, 187, 0, 0)');
  });
});

describe('a colour that is not hex', () => {
  test.each(['rgb(230, 179, 71)', 'gold', '#e6b34780', '#e6b3', '#ggg'])(
    '%p is refused, named',
    (c) => {
      expect(() => mix(c, '#000000', 0)).toThrow(`colour "${c}"`);
      expect(() => clearOf(c)).toThrow(`colour "${c}"`);
    },
  );
});
