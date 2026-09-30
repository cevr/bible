// A scene's `light` multiplies its page and all on it: none leaves the page
// as it is, an even light is one colour over the whole frame, a pool keeps
// its colour over the middle and reaches its edge at the corners, and a light
// read per frame comes up by its amount. A fixed light and the vignette go on
// in one multiply, their product; a light read per frame takes its own.
// Drawn through `createFilm` into a stand-in context, which records the sheet
// each light is multiplied in with (inside the product, for a fixed one) and
// the gradient the sheet was filled with; bun has no canvas.

import { describe, expect, test } from 'bun:test';
import { type Frame, type Light, SHEETS_KEPT, type SceneSpec, createFilm } from './film.ts';
import { type Drawn, type StandInGradient, recorder, withDom } from './fixtures/stand-in.ts';

const W = 320;
const H = 180;
const DUR = 10;

/** The rising light: one object, its amount rewritten each frame. */
/** A light whose amount a scene rewrites each frame. */
interface Rising extends Light {
  amount: number;
}
const RISING: Rising = { color: '#808080', amount: 0 };
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

/** Every multiply `scene`'s frame takes `through` its length (0..1). */
const multiplies = (scene: string, through: number): ReadonlyArray<Drawn> => {
  const r = recorder(W, H);
  const index = lights.findIndex(([id]) => id === scene);
  withDom(() => film.render(r.ctx, (index + through) * DUR));
  return r.images.filter((d) => d.comp === 'multiply');
};

/** Whether a sheet is one gradient over the whole frame (a light), not white under others (a product, the vignette). */
const isLight = (d: Drawn) =>
  d.comp === 'multiply' && d.image.drawn.fills.every((f) => f.style !== '#ffffff');

/**
 * The lights `scene` was multiplied by `through` its length (0..1): each
 * sheet filled with one gradient over the whole frame, and the alpha it went
 * on at, found inside the product a fixed light shares with the vignette.
 */
const lit = (scene: string, through: number): ReadonlyArray<Drawn> =>
  multiplies(scene, through)
    .flatMap((d) => (isLight(d) ? [d] : d.image.drawn.images))
    .filter(isLight);

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

  test('a fixed light and the vignette are one multiply; a light read per frame and it are two', () => {
    expect(multiplies('even', 0.5)).toHaveLength(1);
    expect(multiplies('pool', 0.5)).toHaveLength(1);
    expect(multiplies('rising', 0.5)).toHaveLength(2);
    // Unlit, the vignette alone.
    expect(multiplies('unlit', 0.5)).toHaveLength(1);
  });

  test('keeps a few light sheets, however many colours a light moves through', () => {
    const shifting = (f: Frame): Light => ({
      color: `#${(f.t * 10).toString(16).padStart(6, '0')}`,
    });
    const many = withDom(() =>
      createFilm({
        title: 'shifting',
        width: W,
        height: H,
        paper: { base: '#ffffff', tone: '#ffffff', seed: 1 },
        shade: '#ffffff',
        finish: { vignette: 0, grain: 0 },
        scenes: [{ id: 'shifting', min: DUR, drift: 0, draw: () => {}, light: shifting }],
      }),
    );
    const made = withDom(() => {
      const r = recorder(W, H);
      for (let i = 0; i < 40; i++) many.render(r.ctx, (i / 40) * DUR);
      return r.images.filter(isLight).map((d) => d.image);
    });
    // Each frame made its own sheet; only the last few are held for reuse.
    expect(new Set(made).size).toBe(40);
    const first = withDom(() => {
      const r = recorder(W, H);
      many.render(r.ctx, 0);
      return r.images.filter(isLight)[0]?.image;
    });
    expect(first).not.toBe(made[0]);
    const last = withDom(() => {
      const r = recorder(W, H);
      many.render(r.ctx, (39 / 40) * DUR);
      return r.images.filter(isLight)[0]?.image;
    });
    expect(last).toBe(made[39]);
    expect(SHEETS_KEPT).toBeLessThanOrEqual(8);
  });
});
