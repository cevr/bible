// A cutout face takes its pastel pre-blended only under canvas state where one
// fill of the blended tile lands the same pixels as the fill-then-soft-light
// draw: opaque, source-over, unfiltered and shadowless. Any other state keeps
// the two-pass draw, so a faded, blurred or shadowed face looks as it did.

import { describe, expect, test } from 'bun:test';
import { type FaceState, preblends } from './cutout.ts';

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
