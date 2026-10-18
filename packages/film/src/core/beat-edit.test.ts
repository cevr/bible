import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { heldWithin, holdWritten, movedOrder, movedWords } from './beat-edit.ts';

const IDS = ['cold', 'title', 'look', 'woman', 'end'];

describe('a beat moved', () => {
  test('goes before the beat named, or to the end', () => {
    expect(Result.getOrThrow(movedOrder(IDS, 'look', Option.some('title')))).toEqual([
      'cold',
      'look',
      'title',
      'woman',
      'end',
    ]);
    expect(Result.getOrThrow(movedOrder(IDS, 'cold', Option.none()))).toEqual([
      'title',
      'look',
      'woman',
      'end',
      'cold',
    ]);
    expect(movedWords('look', Option.some('woman'))).toBe('Moved look before woman.');
  });

  test('is refused when it is no move, names no beat, or breaks the parts', () => {
    expect(Result.isFailure(movedOrder(IDS, 'look', Option.some('woman')))).toBe(true);
    expect(Result.isFailure(movedOrder(IDS, 'look', Option.some('look')))).toBe(true);
    expect(Result.isFailure(movedOrder(IDS, 'nope', Option.none()))).toBe(true);
    const acts = [
      { from: 'cold', name: 'one' },
      { from: 'look', name: 'two' },
    ];
    const broken = movedOrder(IDS, 'look', Option.some('cold'), [acts]);
    expect(Result.isFailure(broken) && broken.failure).toContain('break the film');
    expect(Result.isSuccess(movedOrder(IDS, 'end', Option.some('woman'), [acts]))).toBe(true);
  });
});

describe('a hold trimmed', () => {
  test('snaps to a tenth and stays above its floor, or the beat’s own when lower', () => {
    expect(heldWithin('tail', 3.04, 0.1)).toBe(3);
    expect(heldWithin('tail', -1, 0.1)).toBe(0.1);
    expect(heldWithin('lead', 0.1, 0.7)).toBe(0.5);
    expect(heldWithin('lead', 0.1, 0.4)).toBe(0.4);
    expect(heldWithin('tail', 99, 1)).toBe(30);
  });

  test('a tail on its default is written as none; a lead always', () => {
    expect(holdWritten('tail', 0.1)).toEqual(Option.none());
    expect(holdWritten('tail', 1.6)).toEqual(Option.some(1.6));
    expect(holdWritten('lead', 0.5)).toEqual(Option.some(0.5));
  });
});
