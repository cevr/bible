// A cutout face takes its pastel pre-blended only under canvas state where one
// fill of the blended tile lands the same pixels as the fill-then-soft-light
// draw: opaque, source-over, unfiltered and shadowless. Any other state keeps
// the two-pass draw, so a faded, blurred or shadowed face looks as it did.

import { describe, expect, test } from 'bun:test';
import { type FaceState, magnifies, preblends, stretchOf } from './cutout.ts';

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
