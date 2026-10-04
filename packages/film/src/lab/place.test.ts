// The lab's place round-trips through its URL: the path names the
// selection's scene, else the playhead's; `#t=` is the frame's time in that
// scene; an old bare `#<seconds>` is film time; anything else opens at the
// start.

import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { layout } from '../core/layout.ts';
import { labHref, labOpensAt, labPlaceOf, selectsCue } from './place.ts';

const placed = Result.getOrThrow(
  layout(
    [
      { id: 'a', min: 4 },
      { id: 'b', min: 5 },
    ],
    { voice: '', scenes: {} },
  ),
);
const b = placed[1]?.start ?? Number.NaN;
const none = { selection: Option.none(), note: Option.none() };

describe("the lab's place", () => {
  test('reads the scene, a cue or a knob, the note and the time', () => {
    expect(labPlaceOf('/films/f/lab/b?cue=rise&note=n3#t=1.5')).toEqual({
      scene: Option.some('b'),
      selection: Option.some({ _tag: 'Cue', scene: 'b', name: 'rise' }),
      note: Option.some('n3'),
      t: Option.some(1.5),
    });
    expect(labPlaceOf('/films/f/lab/a?knob=spot').selection).toEqual(
      Option.some({ _tag: 'Knob', scene: 'a', name: 'spot' }),
    );
    expect(labPlaceOf('/films/f/lab?note=n1').note).toEqual(Option.some('n1'));
    expect(labPlaceOf('/films/f/play#t=3').scene).toEqual(Option.none());
  });

  test('a path with no scene names the scene under the playhead, its time in that scene', () => {
    expect(labHref('f', placed, none, b + 1)).toBe('/films/f/lab/b#t=1');
    expect(labHref('f', placed, none, 1)).toBe('/films/f/lab/a#t=1');
  });

  test("a selection keeps its scene in the path, the time signed against that scene's start", () => {
    const pick = {
      selection: Option.some({ _tag: 'Cue' as const, scene: 'b', name: 'rise' }),
      note: Option.some('n3'),
    };
    const href = labHref('f', placed, pick, 1);
    expect(href).toBe(`/films/f/lab/b?cue=rise&note=n3#t=${1 - b}`);
    expect(labOpensAt(placed, href)).toBeCloseTo(1, 9);
    expect(labPlaceOf(href).selection).toEqual(pick.selection);
  });

  test('crossing into the next scene rebases the path and the time in one write', () => {
    const before = labHref('f', placed, none, b - 0.5);
    const after = labHref('f', placed, none, b + 0.5);
    expect(labPlaceOf(before).scene).toEqual(Option.some('a'));
    expect(labPlaceOf(after)).toMatchObject({ scene: Option.some('b'), t: Option.some(0.5) });
  });

  test('opens at the time it names, an old bare hash as film time, else the scene start', () => {
    expect(labOpensAt(placed, '/films/f/lab/b#t=2')).toBe(b + 2);
    expect(labOpensAt(placed, '/films/f/lab#t=2')).toBe(2);
    expect(labOpensAt(placed, '/films/f/lab/b?cue=rise#6.25')).toBe(6.25);
    expect(labOpensAt(placed, '/films/f/lab/b')).toBe(b);
    expect(labOpensAt(placed, '/films/f/lab')).toBe(0);
    expect(labOpensAt(placed, '/films/f/lab/gone#t=2')).toBe(2);
  });

  test('names a cue only when its scene and name match', () => {
    const sel = Option.some({ _tag: 'Cue' as const, scene: 'one', name: 'rise' });
    expect(selectsCue(sel, 'one', 'rise')).toBe(true);
    expect(selectsCue(sel, 'two', 'rise')).toBe(false);
    expect(selectsCue(Option.none(), 'one', 'rise')).toBe(false);
  });
});
