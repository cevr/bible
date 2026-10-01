// A cutout face takes its pastel pre-blended only under canvas state where one
// fill of the blended tile lands the same pixels as the fill-then-soft-light
// draw: opaque, source-over, unfiltered and shadowless. Any other state keeps
// the two-pass draw, so a faded, blurred or shadowed face looks as it did.

import { describe, expect, test } from 'bun:test';
import { type FaceState, cutout, magnifies, preblends, stretchOf } from './cutout.ts';
import { recorder, withDom } from './fixtures/stand-in.ts';

const flat: FaceState = {
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
  filter: 'none',
  shadowColor: 'rgba(0, 0, 0, 0)',
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
};

describe('preblends', () => {
  test('a flat, opaque, unfiltered, shadowless face pre-blends', () => {
    expect(preblends(flat)).toBe(true);
  });

  test('a transparent shadow colour or a zero-size shadow casts nothing', () => {
    expect(preblends({ ...flat, shadowColor: 'transparent', shadowBlur: 12 })).toBe(true);
    expect(preblends({ ...flat, shadowColor: 'rgba(0, 0, 0, 0.5)' })).toBe(true);
  });

  test.each<[string, Partial<FaceState>]>([
    ['faded', { globalAlpha: 0.99 }],
    ['composited', { globalCompositeOperation: 'multiply' }],
    ['blurred by the camera', { filter: 'blur(4.00px)' }],
    ['shadowed by a blur', { shadowColor: 'rgba(0, 0, 0, 0.5)', shadowBlur: 8 }],
    ['shadowed by an offset', { shadowColor: '#000', shadowOffsetY: 2 }],
  ])('a %s face keeps the two-pass draw', (_, change) => {
    expect(preblends({ ...flat, ...change })).toBe(false);
  });
});

describe('magnifies', () => {
  const turn = (sx: number, sy: number, rot: number) => ({
    a: Math.cos(rot) * sx,
    b: Math.sin(rot) * sx,
    c: -Math.sin(rot) * sy,
    d: Math.cos(rot) * sy,
  });

  test('the stretch is the larger axis scale, whatever the turn', () => {
    expect(stretchOf(turn(1, 1, 0))).toBeCloseTo(1);
    expect(stretchOf(turn(1.4, 1.4, 0.7))).toBeCloseTo(1.4);
    expect(stretchOf(turn(3, 0.5, 1.2))).toBeCloseTo(3);
    expect(stretchOf({ a: 1, b: 0, c: 1, d: 1 })).toBeCloseTo((1 + Math.sqrt(5)) / 2);
  });

  test.each([
    ['identity', turn(1, 1, 0)],
    ['a turn', turn(1, 1, 0.7)],
    ['a camera pulled back', turn(0.3, 0.3, 0)],
    ['a slight push', turn(1.04, 1.04, 0)],
  ])('%s keeps the pre-blend', (_, m) => {
    expect(magnifies(m)).toBe(false);
  });

  test.each([
    ['a camera pushed in to 1.4', turn(1.4, 1.4, 0)],
    ['a squash landing', turn(1, 1.4, 0)],
    ['a wide squash', turn(3, 0.5, 0)],
    ['a skew', { a: 1, b: 0, c: 0.5, d: 1 }],
  ])('%s takes the two-pass draw', (_, m) => {
    expect(magnifies(m)).toBe(true);
  });
});

describe('a cutout on the stand-in takes the face path it takes on a canvas', () => {
  const square: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [120, 0],
    [120, 120],
    [0, 120],
  ];

  /** Whether a cutout drawn after `before` soft-lit its pastel over the face (the two-pass draw). */
  const layers = (before: (ctx: CanvasRenderingContext2D) => void) =>
    withDom(() => {
      let softLit = false;
      const { ctx } = recorder(400, 400, {
        record: false,
        onCall: (key, args) => {
          if (key === 'globalCompositeOperation' && args[0] === 'soft-light') softLit = true;
        },
      });
      before(ctx);
      cutout(ctx, [...square], { color: '#c8643a', grain: 0.6 }, { seed: 7, boil: 0 });
      return softLit;
    });

  test('an opaque face on a flat sheet takes one fill of its pre-blended tile', () => {
    expect(layers(() => undefined)).toBe(false);
  });

  test('a shadow set and restored before it casts nothing on the face', () => {
    expect(
      layers((ctx) => {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 8;
        ctx.restore();
      }),
    ).toBe(false);
  });

  test('a faded, pushed-in or shadowed face keeps the two-pass draw', () => {
    expect(layers((ctx) => (ctx.globalAlpha = 0.5))).toBe(true);
    expect(layers((ctx) => ctx.scale(1.4, 1.4))).toBe(true);
    expect(
      layers((ctx) => {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 8;
      }),
    ).toBe(true);
  });
});
