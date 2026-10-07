import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { walkFrom } from './walk.ts';

describe('a walk through time (`.`/`,`, ⇧N/⌥⇧N, F/⇧F)', () => {
  const times = [3, 1, 2];
  const at = (T: number, toward: 'next' | 'previous') => walkFrom(times, (t) => t, T, toward);

  test('the next past the time shown, the previous before it, in time order', () => {
    expect(at(1.5, 'next')).toEqual(Option.some(2));
    expect(at(1.5, 'previous')).toEqual(Option.some(1));
  });

  test('a step from a thing never lands on the same thing', () => {
    expect(at(2, 'next')).toEqual(Option.some(3));
    expect(at(2 + 1 / 120, 'previous')).toEqual(Option.some(1));
  });

  test('past either end there is nothing', () => {
    expect(at(3, 'next')).toEqual(Option.none());
    expect(at(1, 'previous')).toEqual(Option.none());
  });
});
