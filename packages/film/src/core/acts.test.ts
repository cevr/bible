import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { membersOf, partStarts, stretchesOf } from './acts.ts';
import { layout } from './layout.ts';
import type { Timed } from './schema.ts';

const scenes: ReadonlyArray<Timed> = [
  { id: 'a', min: 4 },
  { id: 'b', min: 5 },
  { id: 'c', min: 6 },
  { id: 'd', min: 7 },
];
const ids = scenes.map((s) => s.id);
const placed = Result.getOrThrow(layout(scenes, { voice: '', scenes: {} }));

const part = (from: string, name = from) => ({ from, name });

describe('membersOf', () => {
  test('each part holds its scene until the next part’s; the first holds every scene before its own', () => {
    const members = Result.getOrThrow(membersOf([part('b'), part('d')], ids));
    expect(members.map((m) => [m.part.name, m.scenes])).toEqual([
      ['b', ['a', 'b', 'c']],
      ['d', ['d']],
    ]);
  });

  test('a part naming no scene fails with what the film has', () => {
    const lost = membersOf([part('a'), part('nowhere')], ids);
    expect(Result.getFailure(lost).pipe(Option.map((e) => [e._tag, e.message]))).toEqual(
      Option.some(['UnknownScene', expect.stringContaining('nowhere')]),
    );
  });

  test('a part declared out of film order fails, naming the part ahead of it', () => {
    for (const parts of [
      [part('a', 'one'), part('c', 'two'), part('b', 'three')],
      [part('c', 'one'), part('b', 'two')],
      [part('a', 'one'), part('a', 'again')],
    ]) {
      const failure = Result.getFailure(membersOf(parts, ids));
      expect(Option.map(failure, (e) => e._tag)).toEqual(Option.some('PartOutOfOrder'));
    }
    expect(
      Result.getFailure(membersOf([part('a', 'one'), part('c', 'two'), part('b', 'three')], ids)),
    ).toMatchObject(Option.some({ part: 'three', from: 'b', after: 'two' }));
  });
});

describe('stretchesOf', () => {
  test('a stretch spans its scenes: from the first one’s start to the last one’s end', () => {
    const [first, second] = Result.getOrThrow(stretchesOf([part('a'), part('c')], placed));
    expect([first?.start, first?.end]).toEqual([
      0,
      (placed[1]?.start ?? 0) + (placed[1]?.dur ?? 0),
    ]);
    expect(second?.start).toBe(placed[2]?.start ?? Number.NaN);
    expect(second?.end).toBe((placed[3]?.start ?? 0) + (placed[3]?.dur ?? 0));
  });
});

describe('partStarts', () => {
  test('the first part opens the film; later ones start at their scene', () => {
    expect(Result.getOrThrow(partStarts([part('b'), part('c')], placed))).toEqual([
      0,
      placed[2]?.start ?? Number.NaN,
    ]);
  });

  test('every part naming no scene is refused, not just the first', () => {
    const lost = partStarts([part('x'), part('a'), part('y')], placed);
    expect(Result.getFailure(lost).pipe(Option.map((u) => u.map((e) => e.scene)))).toEqual(
      Option.some(['x', 'y']),
    );
  });
});
