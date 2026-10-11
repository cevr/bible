// The strip's Follow key: a cue named with a space is still one lane, and the
// same live lanes in another scene are another key.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { lanesKey, lanesOf } from './lanes.ts';

describe('the live lanes the strip follows', () => {
  test('a name with a space is one lane, first and last in the strip’s order', () => {
    const key = lanesKey('roof', ['one lit', 'b', 'two held'], new Set(['two held', 'one lit']));
    expect(lanesOf(key)).toStrictEqual(
      Option.some({ scene: 'roof', first: 'one lit', last: 'two held' }),
    );
  });

  test('the same live lanes in another scene are another key', () => {
    const live = new Set(['rise']);
    expect(lanesKey('one', ['rise'], live)).not.toBe(lanesKey('two', ['rise'], live));
  });

  test('nothing live is no key, and no lanes', () => {
    expect(lanesKey('one', ['rise'], new Set())).toBe('');
    expect(lanesOf('')).toStrictEqual(Option.none());
  });
});
