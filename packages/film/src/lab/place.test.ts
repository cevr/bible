// The lab's place round-trips through its URL: the path names the
// selection's scene, else the playhead's; `#t=` is the frame's time in that
// scene; an old bare `#<seconds>` is film time; anything else opens at the
// start.

import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { layout } from '../core/layout.ts';
import { beatAt, labHref, labHrefWith, labOpensAt, labPlaceOf, selectsCue } from './place.ts';

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
const none = {
  selection: Option.none(),
  note: Option.none(),
  beat: Option.none(),
  view: 'off' as const,
  loop: Option.none(),
};

describe("the lab's place", () => {
  test('reads the scene, a cue or a knob, the note and the time', () => {
    expect(labPlaceOf('/films/f/lab/b?cue=rise&note=n3#t=1.5')).toEqual({
      scene: Option.some('b'),
      selection: Option.some({ _tag: 'Cue', scene: 'b', name: 'rise' }),
      note: Option.some('n3'),
      beat: Option.none(),
      view: 'off',
      t: Option.some(1.5),
      loop: Option.none(),
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
      beat: Option.none(),
      view: 'off' as const,
      loop: Option.none(),
    };
    const href = labHref('f', placed, pick, 1);
    expect(href).toBe(`/films/f/lab/b?cue=rise&note=n3#t=${1 - b}`);
    expect(labOpensAt(placed, href)).toBeCloseTo(1, 9);
    expect(labPlaceOf(href).selection).toEqual(pick.selection);
  });

  test("the studio's beat rides in ?beat=: read back, kept by every write, else the path's scene", () => {
    const at = '/films/f/lab/a?beat=b#t=1';
    expect(labPlaceOf(at).beat).toEqual(Option.some('b'));
    expect(beatAt(at)).toEqual(Option.some('b'));
    // With none picked, the studio is on the path's scene.
    expect(beatAt('/films/f/lab/a#t=1')).toEqual(Option.some('a'));
    expect(beatAt('/films/f/lab#t=1')).toEqual(Option.none());
    // Play crossing into b keeps the beat picked in a.
    expect(labHrefWith('f', placed, at, {}, b + 0.5)).toBe('/films/f/lab/b?beat=b#t=0.5');
    expect(labHref('f', placed, none, 1)).not.toContain('beat=');
  });

  test("the compare's mode rides in ?view= (PA-9): read back, kept across a scene boundary, off unwritten", () => {
    expect(labPlaceOf('/films/f/lab/b?view=diff#t=1').view).toBe('diff');
    expect(labPlaceOf('/films/f/lab?view=blink').view).toBe('blink');
    expect(labPlaceOf('/films/f/lab/b?view=sideways').view).toBe('off');
    const wiping = { ...none, view: 'wipe' as const };
    expect(labHref('f', placed, wiping, 1)).toBe('/films/f/lab/a?view=wipe#t=1');
    expect(labPlaceOf(labHref('f', placed, wiping, b + 1)).view).toBe('wipe');
    expect(labHref('f', placed, none, 1)).not.toContain('view=');
  });

  test('the A–B loop rides in #loop= in film seconds: read back, kept across a scene boundary, none unwritten or ill-formed', () => {
    const looping = { ...none, loop: Option.some({ from: 1.5, to: b + 2 }) };
    const href = labHref('f', placed, looping, 1);
    expect(href).toBe(`/films/f/lab/a#t=1&loop=1.5,${b + 2}`);
    expect(labPlaceOf(href).loop).toEqual(looping.loop);
    // The path moves to the next scene; the loop's film seconds stay as they were.
    expect(labPlaceOf(labHref('f', placed, looping, b + 1)).loop).toEqual(looping.loop);
    expect(labHref('f', placed, none, 1)).not.toContain('loop=');
    for (const bad of ['3,1', '2,2', '1', '1,2,3', 'a,b', ','])
      expect(labPlaceOf(`/films/f/lab/a#t=1&loop=${bad}`).loop).toEqual(Option.none());
    // A link from before the key reads as no loop, its time as before.
    expect(labPlaceOf('/films/f/lab/a#t=1')).toMatchObject({
      t: Option.some(1),
      loop: Option.none(),
    });
  });

  test('a write keeps what the URL holds beside the change it makes', () => {
    const at = `/films/f/lab/b?cue=rise&view=wipe#t=0&loop=1,2`;
    expect(labHrefWith('f', placed, at, {}, b + 0.5)).toBe(
      `/films/f/lab/b?cue=rise&view=wipe#t=0.5&loop=1,2`,
    );
    expect(labHrefWith('f', placed, at, { loop: Option.none() }, b)).toBe(
      `/films/f/lab/b?cue=rise&view=wipe#t=0`,
    );
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
