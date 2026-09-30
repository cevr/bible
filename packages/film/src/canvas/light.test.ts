// A scene's `light` multiplies its page and all on it: none leaves the page
// as it is, an even light is one colour over the whole frame, a pool keeps
// its colour over the middle and reaches its edge at the corners, and a light
// read per frame comes up by its amount. Drawn through `createFilm` into a
// stand-in context, which records the sheet each light is multiplied in with
// and the gradient the sheet was filled with; bun has no canvas.

import { describe, expect, test } from 'bun:test';
import { type Frame, type Light, type SceneSpec, createFilm } from './film.ts';
import { type Drawn, type StandInGradient, recorder, withDom } from './fixtures/stand-in.ts';

const W = 320;
const H = 180;
const DUR = 10;

/** The rising light: one object, its amount rewritten each frame. */
const RISING = { color: '#808080', amount: 0 };
const rising = (f: Frame): Light => {
  RISING.amount = f.t / f.dur;
  return RISING;
};

const lights: ReadonlyArray<readonly [string, SceneSpec['light']]> = [
  ['unlit', undefined],
  ['even', { color: '#808080' }],
  ['pool', { color: '#ffffff', edge: '#000000' }],
  ['rising', rising],
];

const film = withDom(() =>
  createFilm({
    title: 'light',
    width: W,
    height: H,
    paper: { base: '#ffffff', tone: '#ffffff', seed: 1 },
    shade: '#ffffff',
    finish: { vignette: 0, grain: 0 },
    scenes: lights.map(([id, light]) => ({ id, min: DUR, drift: 0, draw: () => {}, light })),
  }),
);

/**
 * The lights `scene` was multiplied by `through` its length (0..1): each
 * sheet filled with one gradient over the whole frame, and the alpha it went
 * on at. (The film's vignette multiplies too, from a white sheet: a white
 * sheet leaves a frame as it is.)
 */
const lit = (scene: string, through: number): ReadonlyArray<Drawn> => {
  const r = recorder(W, H);
  const index = lights.findIndex(([id]) => id === scene);
  withDom(() => film.render(r.ctx, (index + through) * DUR));
  return r.images.filter(
    (d) => d.comp === 'multiply' && d.image.drawn.fills.every((f) => f.style !== '#ffffff'),
  );
};

/** The one gradient a light's sheet was filled with, over the whole frame. */
const gradientOf = (drawn: Drawn | undefined): StandInGradient => {
  const fills = drawn === undefined ? [] : drawn.image.drawn.fills;
  expect(fills).toHaveLength(1);
  expect(fills[0]?.rect).toEqual([0, 0, W, H]);
  return fills[0]?.style as StandInGradient;
};

describe('a scene is lit by its light', () => {
  test('none leaves the page as it is', () => {
    expect(lit('unlit', 0.5)).toEqual([]);
  });

  test('an even light is one colour over the whole frame, at full strength', () => {
    const [even] = lit('even', 0.5);
    expect(even?.alpha).toBe(1);
    expect(gradientOf(even).stops.map(([, c]) => c)).toEqual(['#808080', '#808080']);
  });

  test('a pool keeps its colour over the middle and reaches its edge at the corners', () => {
    const [pool] = lit('pool', 0.5);
    const g = gradientOf(pool);
    expect(g.stops).toEqual([
      [0, '#ffffff'],
      [1, '#000000'],
    ]);
    const [x0, y0, inner, x1, y1, outer] = g.circles;
    // Both circles about the frame's middle, the colour held inside the inner one.
    expect([x0, y0, x1, y1]).toEqual([W / 2, H / 2, W / 2, H / 2]);
    expect(inner).toBeGreaterThan(0);
    // The edge colour lands exactly on the corners.
    expect(outer).toBeCloseTo(Math.hypot(W / 2, H / 2));
  });

  test('a light read per frame comes up by its amount', () => {
    expect(lit('rising', 0.25).map((d) => d.alpha)).toEqual([0.25]);
    expect(lit('rising', 0.75).map((d) => d.alpha)).toEqual([0.75]);
  });
});
