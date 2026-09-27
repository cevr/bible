import { describe, expect, test } from 'bun:test';
import { Array as Arr, Option } from 'effect';
import { type Placed, layout } from './layout.ts';
import { unrecorded } from './rive-testing.ts';
import type { SceneBoard, SceneEvent } from './rive.ts';
import { ATTACK, type Knot, drawnAt, realAt, scenePins, warpKnots } from './warp.ts';

/** A scene `dur` long whose voice starts at `speechStart` and says each mark at its time. */
const placed = (
  marks: ReadonlyArray<readonly [string, number]>,
  { dur = 6, speechStart = 1 }: { readonly dur?: number; readonly speechStart?: number } = {},
): Placed => {
  const base = Arr.getUnsafe(layout([{ id: 'scene' }], unrecorded), 0);
  return {
    ...base,
    dur,
    speechStart,
    voice: { ...base.voice, duration: dur - speechStart, marks: new Map(marks) },
  };
};

/** A board whose `main` is `seconds` long, firing each Event at its time. */
const board = (
  events: ReadonlyArray<readonly [string, number]>,
  seconds: Option.Option<number> = Option.some(4),
): SceneBoard => ({
  name: 'scene',
  id: '1:1',
  width: 1920,
  height: 1080,
  x: 0,
  y: 0,
  main: Option.map(seconds, (s) => ({ id: '1:2', fps: 60, frames: s * 60, seconds: s })),
  events: events.map(([name, at]): SceneEvent => ({ name, id: `id-${name}`, at })),
  unkeyed: [],
  runs: [],
  storyboard: false,
  component: true,
});

describe('warpKnots', () => {
  test('after each pin but the last, the timeline runs at its own speed for up to ATTACK', () => {
    expect(
      warpKnots([
        [0, 0],
        [2, 1],
        [5, 4],
      ]),
    ).toEqual([
      [0, 0],
      [0.5, 0.5],
      [2, 1],
      [2 + ATTACK, 1 + ATTACK],
      [5, 4],
    ]);
  });

  test('an attack takes at most half the way to the next pin, on either clock', () => {
    const [, attack] = warpKnots([
      [0, 0],
      [3, 0.4],
    ]);
    expect(attack).toEqual([0.2, 0.2]);
  });

  test('a gap too short for a frame gets no attack', () => {
    expect(
      warpKnots([
        [0, 0],
        [0.02, 0.02],
      ]),
    ).toEqual([
      [0, 0],
      [0.02, 0.02],
    ]);
  });
});

describe('drawnAt and realAt', () => {
  const knots: ReadonlyArray<Knot> = [
    [0, 0],
    [0.5, 0.5],
    [2, 1],
    [5, 4],
  ];

  test('interpolate between knots, and run each other backwards', () => {
    expect(drawnAt(knots, 1.25)).toBeCloseTo(0.75);
    expect(realAt(knots, 0.75)).toBeCloseTo(1.25);
    expect(realAt(knots, drawnAt(knots, 3.3))).toBeCloseTo(3.3);
  });

  test('hold flat past either end', () => {
    expect(drawnAt(knots, -1)).toBe(0);
    expect(drawnAt(knots, 9)).toBe(4);
    expect(realAt(knots, 7)).toBe(5);
  });

  test('with no knots, time passes unchanged', () => {
    expect(drawnAt([], 3)).toBe(3);
    expect(realAt([], 3)).toBe(3);
  });
});

describe('scenePins', () => {
  test('pins each mark where it is spoken to where its Event is drawn, from start to end', () => {
    const pins = scenePins(
      placed([
        ['a', 0.5],
        ['b', 1.5],
      ]),
      board([
        ['a', 1],
        ['b', 2],
      ]),
    );
    expect(pins.pinned).toEqual([
      { mark: 'a', real: 1.5, drawn: 1 },
      { mark: 'b', real: 2.5, drawn: 2 },
    ]);
    expect(pins.unpinned).toEqual([]);
    expect(pins.disordered).toEqual([]);
    expect(pins.knots).toEqual(
      warpKnots([
        [0, 0],
        [1.5, 1],
        [2.5, 2],
        [6, 4],
      ]),
    );
    expect(drawnAt(pins.knots, 2.5)).toBe(2);
  });

  test('a mark with no Event of its name is unpinned, and the warp runs without it', () => {
    const pins = scenePins(
      placed([
        ['a', 0.5],
        ['lost', 1],
      ]),
      board([['a', 1]]),
    );
    expect(pins.unpinned).toEqual(['lost']);
    expect(pins.pinned.map((p) => p.mark)).toEqual(['a']);
  });

  test('an Event drawn before an earlier mark, or at the end, is disordered and left out', () => {
    const pins = scenePins(
      placed([
        ['a', 0.5],
        ['b', 1.5],
        ['c', 2],
      ]),
      board([
        ['b', 0.5],
        ['a', 1],
        ['c', 4],
      ]),
    );
    expect(pins.pinned.map((p) => p.mark)).toEqual(['a']);
    expect(pins.disordered).toEqual(['b', 'c']);
  });

  test('an Event keyed twice pins at its first key', () => {
    const pins = scenePins(
      placed([['a', 0.5]]),
      board([
        ['a', 1],
        ['a', 3],
      ]),
    );
    expect(pins.pinned).toEqual([{ mark: 'a', real: 1.5, drawn: 1 }]);
  });

  test('two marks on one word, drawn at one moment, make one pin', () => {
    const pins = scenePins(
      placed([
        ['a', 0.5],
        ['b', 0.5],
      ]),
      board([
        ['a', 1],
        ['b', 1],
      ]),
    );
    expect(pins.pinned.map((p) => p.mark)).toEqual(['a', 'b']);
    expect(pins.disordered).toEqual([]);
    expect(pins.knots).toEqual(
      warpKnots([
        [0, 0],
        [1.5, 1],
        [6, 4],
      ]),
    );
  });

  test('a scene with no main timeline has no warp, and every mark is unpinned', () => {
    const pins = scenePins(placed([['a', 0.5]]), board([], Option.none()));
    expect(pins.knots).toEqual([]);
    expect(pins.unpinned).toEqual(['a']);
  });
});
