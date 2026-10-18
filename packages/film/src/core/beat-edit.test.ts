import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import {
  dropMoves,
  heldWithin,
  holdWritten,
  movedOrder,
  movedWords,
  trimReadout,
} from './beat-edit.ts';

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

  test('a drop on itself or just after itself does not move it', () => {
    expect(dropMoves(IDS, 'look', 2)).toBe(false);
    expect(dropMoves(IDS, 'look', 3)).toBe(false);
    expect(dropMoves(IDS, 'look', 1)).toBe(true);
    expect(dropMoves(IDS, 'look', 5)).toBe(true);
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

  test('a floor off the grid holds itself: a trim at or under it asks the floor, not the step above', () => {
    expect(heldWithin('tail', 0.05, 0.05)).toBe(0.05);
    expect(heldWithin('tail', 0.01, 0.05)).toBe(0.05);
    expect(heldWithin('lead', 0.45, 0.45)).toBe(0.45);
    expect(heldWithin('lead', 0.47, 0.45)).toBe(0.5);
  });

  test('a tail on its default is written as none; a lead always', () => {
    expect(holdWritten('tail', 0.1)).toEqual(Option.none());
    expect(holdWritten('tail', 1.6)).toEqual(Option.some(1.6));
    expect(holdWritten('lead', 0.5)).toEqual(Option.some(0.5));
  });

  test('reads out the change and the length', () => {
    expect(trimReadout(3, 41.5)).toBe('hold +3.0 s · 41.5 s long');
    expect(trimReadout(-0.4, 2)).toBe('hold −0.4 s · 2.0 s long');
  });
});
