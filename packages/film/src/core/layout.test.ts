import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { SCENE_EPSILON, layout, sceneAt, sceneIndexAt } from './layout.ts';

const placed = Result.getOrThrow(
  layout(
    [
      { id: 'a', min: 4 },
      { id: 'b', min: 5 },
    ],
    { voice: '', scenes: {} },
  ),
);
const id = (T: number) => Option.map(sceneAt(placed, T), (p) => p.spec.id);

describe('sceneAt', () => {
  test('a scene owns its own start: the incoming scene plays from its first instant', () => {
    expect(id(3.999)).toEqual(Option.some('a'));
    expect(id(4)).toEqual(Option.some('b'));
  });

  test('a time computed a hair short of a start is in that scene', () => {
    expect(id(4 - SCENE_EPSILON / 2)).toEqual(Option.some('b'));
    expect(id(4 - SCENE_EPSILON * 10)).toEqual(Option.some('a'));
  });

  test('before the film the first scene plays, after it the last', () => {
    expect(id(-1)).toEqual(Option.some('a'));
    expect(id(99)).toEqual(Option.some('b'));
  });

  test('a film with no scenes has none', () => {
    expect(sceneIndexAt([], 1)).toBe(-1);
    expect(sceneAt([], 1)).toEqual(Option.none());
  });
});
