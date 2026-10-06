// Upstream: packages/react/src/floating-ui-react/utils/composite.test.ts
//
// The floating layer's pure part, without a DOM: list index stepping.
// Whether an item counts as disabled reads the DOM, so the browser tests
// cover it (menu.test.ts reaches aria-disabled items; toggle.test.ts skips a
// disabled toggle).
import { describe, expect, it } from 'bun:test';

import { getNextListIndex } from './utils/composite.ts';

const list = (n: number): Array<HTMLElement | null> => Array.from({ length: n }, () => null);

describe('composite list indexes', () => {
  it('stops at the ends without loopFocus', () => {
    const options = { loopFocus: false, minIndex: 0, maxIndex: 3 };
    expect(getNextListIndex(list(4), 3, { ...options, decrement: false })).toEqual({
      index: 3,
      wrapped: false,
    });
    expect(getNextListIndex(list(4), 0, { ...options, decrement: true })).toEqual({
      index: 0,
      wrapped: false,
    });
  });

  it('wraps with loopFocus', () => {
    const options = { loopFocus: true, minIndex: 0, maxIndex: 3 };
    expect(getNextListIndex(list(4), 3, { ...options, decrement: false })).toEqual({
      index: 0,
      wrapped: true,
    });
    expect(getNextListIndex(list(4), 0, { ...options, decrement: true })).toEqual({
      index: 3,
      wrapped: true,
    });
  });
});
