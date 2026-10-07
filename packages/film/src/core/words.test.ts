// A count is said one way everywhere: plural but for one.

import { expect, test } from 'bun:test';
import { counted, plural } from './words.ts';

test('a noun is plural but for one, none included', () => {
  expect([0, 1, 2].map((n) => counted(n, 'scene'))).toEqual(['0 scenes', '1 scene', '2 scenes']);
  expect(plural(1, 'version stack')).toBe('version stack');
  expect(plural(3, 'version stack')).toBe('version stacks');
});
