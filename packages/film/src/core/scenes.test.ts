import { describe, expect, test } from 'bun:test';
import { Array as Arr, Option } from 'effect';
import { layout } from './layout.ts';
import { unrecorded } from './rive-testing.ts';
import type { RiveDocument, SceneBoard, SceneEvent } from './rive.ts';
import { eventTimes, filmScenes } from './scenes.ts';
import { drawnAt } from './warp.ts';

const placed = layout(
  [
    { id: 'a', say: 'One {x}two three four.', lead: 1, tail: 1 },
    { id: 'b', say: 'Five six.' },
    { id: 'c', min: 3 },
  ],
  unrecorded,
);
const a = Arr.getUnsafe(placed, 0);

/** A board 4 s long whose main timeline fires each Event at its time. */
const board = (name: string, events: ReadonlyArray<readonly [string, number]>): SceneBoard => ({
  name,
  id: `${name}:1`,
  width: 1920,
  height: 1080,
  x: 0,
  y: 0,
  main: Option.some({ id: `${name}:2`, fps: 60, frames: 240, seconds: 4 }),
  events: events.map(([event, at]): SceneEvent => ({ name: event, id: `${name}:${event}`, at })),
  unkeyed: [],
  runs: [],
  storyboard: false,
  component: true,
});

const doc = (boards: ReadonlyArray<SceneBoard>): RiveDocument => ({
  boards: new Map(boards.map((b): readonly [string, SceneBoard] => [b.name, b])),
  fonts: [],
  problems: [],
});

describe('filmScenes', () => {
  test('pairs each beat with the artboard of its name, in film order, and lists the rest as missing', () => {
    const film = filmScenes(
      placed,
      doc([board('c', []), board('a', [['x', 1]]), board('Figure', [])]),
    );
    expect(film.scenes.map((s) => s.placed.spec.id)).toEqual(['a', 'c']);
    expect(film.missing).toEqual(['b']);
    expect(film.pins.map((p) => p.scene)).toEqual(['a', 'c']);
  });

  test("warps each scene through its marks' pins", () => {
    const film = filmScenes(placed, doc([board('a', [['x', 1]])]));
    const scene = Arr.getUnsafe(film.scenes, 0);
    const x = a.speechStart + (a.voice.marks.get('x') ?? Number.NaN);
    expect(drawnAt(scene.knots, x)).toBeCloseTo(1);
    expect(Arr.getUnsafe(film.pins, 0).pinned.map((p) => p.mark)).toEqual(['x']);
  });
});

describe('eventTimes', () => {
  test('each Event plays where the warp lands its first key, marks and moments alike', () => {
    const film = filmScenes(
      placed,
      doc([
        board('a', [
          ['x', 1],
          ['slam', 2],
          ['slam', 3],
        ]),
      ]),
    );
    const times = Option.getOrThrow(Option.fromNullishOr(eventTimes(film.scenes).get('a')));
    const x = a.speechStart + (a.voice.marks.get('x') ?? Number.NaN);
    expect(times.get('x')).toBeCloseTo(x);
    // `slam` is drawn a second after `x`, and plays where the warp puts that second.
    const slam = times.get('slam') ?? Number.NaN;
    expect(drawnAt(Arr.getUnsafe(film.scenes, 0).knots, slam)).toBeCloseTo(2);
    expect([...times.keys()]).toEqual(['x', 'slam']);
  });
});
