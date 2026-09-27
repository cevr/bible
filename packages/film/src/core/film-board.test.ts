import { describe, expect, test } from 'bun:test';
import { Array as Arr, Option } from 'effect';
import { FILM_TIMELINE, type FilmScene, filmElements } from './film-board.ts';
import { layout } from './layout.ts';
import { attr, elements, keys, only, unrecorded } from './rive-testing.ts';
import type { SceneBoard } from './rive.ts';

const placed = layout(
  [
    { id: 'a', say: 'One {x}two three four.', lead: 1, tail: 1 },
    { id: 'b', say: 'Five six seven.', enter: { kind: 'fade', dur: 0.8 } },
    { id: 'c', say: 'Eight nine.', enter: { kind: 'pan', dur: 1 } },
  ],
  unrecorded,
);
const a = Arr.getUnsafe(placed, 0);
const b = Arr.getUnsafe(placed, 1);
const c = Arr.getUnsafe(placed, 2);

const board = (name: string, seconds: Option.Option<number>): SceneBoard => ({
  name,
  id: `${name}:1`,
  width: 1920,
  height: 1080,
  x: 0,
  y: 0,
  main: Option.map(seconds, (s) => ({ id: `${name}:2`, fps: 60, frames: s * 60, seconds: s })),
  events: [],
  unkeyed: [],
  runs: [],
  storyboard: false,
  component: true,
});

const scenes: ReadonlyArray<FilmScene> = [
  {
    placed: a,
    board: board('a', Option.some(4)),
    knots: [
      [0, 0],
      [1.5, 1],
      [a.dur, 4],
    ],
  },
  {
    placed: b,
    board: board('b', Option.some(2)),
    knots: [
      [0, 0],
      [b.dur, 2],
    ],
  },
  { placed: c, board: board('c', Option.none()), knots: [] },
];

const film = (soundtrack: Option.Option<string> = Option.none()) =>
  filmElements({ width: 1920, height: 1080, scenes, soundtrack });

const f = (seconds: number) => Math.round(seconds * 60);

/** The keys the Film's timeline sets on `object`'s property `key`. */
const keyed = (roots: ReturnType<typeof film>, object: string, key: number) => {
  const keyedObject = only(roots, 'KeyedObject', { objectId: object });
  return keys(
    Option.getOrThrow(Arr.findFirst(keyedObject.children, (p) => attr(p, 'propertyKey') === key)),
  );
};

const nestId = (roots: ReturnType<typeof film>, scene: string) =>
  String(attr(only(roots, 'NestedArtboard', { name: scene }), 'id'));

describe('filmElements', () => {
  const roots = film();

  test('the timeline runs to the end of the last scene', () => {
    expect(attr(only(roots, 'LinearAnimation', { name: FILM_TIMELINE }), 'duration')).toBe(
      f(c.start + c.dur),
    );
  });

  test('nests the last scene first, so each scene draws over the one before it', () => {
    const order = Arr.getUnsafe(roots, 0)
      .children.filter((e) => e.name === 'NestedArtboard')
      .map((e) => attr(e, 'name'));
    expect(order).toEqual(['c', 'b', 'a']);
  });

  test('a scene shows from its start until the next has arrived; a fade blends it in', () => {
    const OPACITY = 18;
    expect(keyed(roots, nestId(roots, 'a'), OPACITY)).toEqual([
      { frame: 0, value: 1, interpolation: 'hold' },
      { frame: f(b.start + 0.8), value: 0, interpolation: 'hold' },
    ]);
    expect(keyed(roots, nestId(roots, 'b'), OPACITY)).toEqual([
      { frame: 0, value: 0, interpolation: 'hold' },
      { frame: f(b.start), value: 0, interpolation: 'linear' },
      { frame: f(b.start + 0.8), value: 1, interpolation: 'hold' },
      { frame: f(c.start + 1), value: 0, interpolation: 'hold' },
    ]);
    expect(keyed(roots, nestId(roots, 'c'), OPACITY)).toEqual([
      { frame: 0, value: 0, interpolation: 'hold' },
      { frame: f(c.start), value: 1, interpolation: 'hold' },
    ]);
  });

  test('a pan slides the scene in as the one before slides out, easing both ways', () => {
    const X = 13;
    expect(keyed(roots, nestId(roots, 'c'), X)).toEqual([
      { frame: 0, value: 1920, interpolation: 'hold' },
      { frame: f(c.start), value: 1920, interpolation: 'cubic' },
      { frame: f(c.start + 1), value: 0, interpolation: 'hold' },
    ]);
    expect(keyed(roots, nestId(roots, 'b'), X)).toEqual([
      { frame: 0, value: 0, interpolation: 'hold' },
      { frame: f(c.start), value: 0, interpolation: 'cubic' },
      { frame: f(c.start + 1), value: -1920, interpolation: 'hold' },
    ]);
    expect(roots.flatMap(elements).filter((e) => e.name === 'CubicEaseInterpolator')).toHaveLength(
      2,
    );
  });

  test("plays each scene's timeline through its warp, as a fraction of its length", () => {
    const remap = only(roots, 'NestedRemapAnimation', { name: 'a time' });
    expect(attr(remap, 'animationId')).toBe('a:2');
    expect(keyed(roots, String(attr(remap, 'id')), 202)).toEqual([
      { frame: f(a.start), value: 0, interpolation: 'linear' },
      { frame: f(a.start + 1.5), value: 0.25, interpolation: 'linear' },
      { frame: f(a.start + a.dur), value: 1, interpolation: 'linear' },
    ]);
  });

  test('a scene with no main timeline shows its first frame: nothing remaps it', () => {
    const nested = only(roots, 'NestedArtboard', { name: 'c' });
    expect(nested.children).toEqual([]);
  });

  test('every id is its own', () => {
    const ids = roots
      .flatMap(elements)
      .flatMap((e) => e.attrs.filter(([k]) => k === 'id').map(([, v]) => String(v)));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('the soundtrack plays from the first frame, only when there is one', () => {
    const count = (rs: ReturnType<typeof film>, name: string) =>
      rs.flatMap(elements).filter((e) => e.name === name).length;
    expect(count(roots, 'AudioAsset')).toBe(0);
    const scored = film(Option.some('soundtrack.wav'));
    const asset = only(scored, 'AudioAsset');
    expect(attr(asset, 'file')).toBe('soundtrack.wav');
    const event = only(scored, 'AudioEvent');
    expect(attr(event, 'assetId')).toBe(attr(asset, 'id'));
    const trigger = only(scored, 'KeyedObject', { objectId: String(attr(event, 'id')) });
    const property = Arr.getUnsafe(trigger.children, 0);
    expect(attr(property, 'propertyKey')).toBe(395);
    expect(attr(Arr.getUnsafe(property.children, 0), 'frame')).toBe(0);
  });
});
