// The look-book is set in the film's own type: the family of its shorts'
// fonts, read off a CSS font whatever its weight, size or line height.

import { describe, expect, test } from 'bun:test';
import { familyOf } from './lookbook.ts';

describe('familyOf', () => {
  test("what follows a CSS font's size", () => {
    expect(familyOf('600 64px "Fraunces"')).toBe('"Fraunces"');
    expect(familyOf('italic 700 18.5px/1.2 "EB Garamond", serif')).toBe('"EB Garamond", serif');
    expect(familyOf('600 60px serif')).toBe('serif');
  });

  test('a font it cannot read sets in sans-serif', () => {
    expect(familyOf('bold')).toBe('sans-serif');
  });
});
