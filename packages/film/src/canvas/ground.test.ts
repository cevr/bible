// A contact shadow is a flat warm ellipse under the feet: it lands where it
// is put, lies flat, stays within the direction's darkness, and makes its
// gradient once per context rather than every frame.

import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';
import { GROUND_ALPHA, GROUND_FLAT, ground } from './ground.ts';

interface Stop {
  readonly at: number;
  readonly color: string;
}

/** A stand-in context that records gradients, their stops, and every filled rect's transform. */
const recording = () => {
  const stops: Stop[] = [];
  const rects: { x: number; y: number; sx: number; sy: number }[] = [];
  let made = 0;
  let state = { x: 0, y: 0, sx: 1, sy: 1 };
  const stack: (typeof state)[] = [];
  const ctx: CanvasRenderingContext2D = Schema.decodeSync(Schema.Any)({
    fillStyle: '#000',
    save: () => stack.push({ ...state }),
    restore: () => {
      state = stack.pop() ?? state;
    },
    translate: (x: number, y: number) => {
      state = { ...state, x: state.x + x * state.sx, y: state.y + y * state.sy };
    },
    scale: (sx: number, sy: number) => {
      state = { ...state, sx: state.sx * sx, sy: state.sy * sy };
    },
    createRadialGradient: () => {
      made++;
      return { addColorStop: (at: number, color: string) => stops.push({ at, color }) };
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      // The rect's centre and half-extent in the frame.
      rects.push({
        x: state.x + (x + w / 2) * state.sx,
        y: state.y + (y + h / 2) * state.sy,
        sx: (state.sx * w) / 2,
        sy: (state.sy * h) / 2,
      });
    },
  });
  return { ctx, stops, rects, made: () => made };
};

const alphaOf = (color: string) => Number(color.split(',').at(-1)?.replace(')', ''));

describe('ground', () => {
  test('lies flat under the point it is given, as wide as asked', () => {
    const r = recording();
    ground(r.ctx, 500, 800, 200);
    expect(r.rects).toHaveLength(1);
    const [rect] = r.rects;
    expect(rect?.x).toBeCloseTo(500);
    expect(rect?.y).toBeCloseTo(800);
    expect(rect?.sx).toBeCloseTo(100);
    expect(rect?.sy).toBeCloseTo(100 * GROUND_FLAT);
  });

  test('is darkest under the feet, within 15–30 %, and gone at its rim', () => {
    const r = recording();
    ground(r.ctx, 0, 0, 100);
    const alphas = r.stops.map((s) => alphaOf(s.color));
    expect(alphas[0]).toBe(GROUND_ALPHA);
    expect(GROUND_ALPHA).toBeGreaterThanOrEqual(0.15);
    expect(GROUND_ALPHA).toBeLessThanOrEqual(0.3);
    expect(alphas.at(-1)).toBe(0);
    expect(r.stops.at(-1)?.at).toBe(1);
  });

  test('makes its gradient once per context, however many frames and widths', () => {
    const r = recording();
    for (let i = 0; i < 30; i++) ground(r.ctx, i, 0, 50 + i);
    expect(r.made()).toBe(1);
    ground(r.ctx, 0, 0, 50, { alpha: 0.2 });
    expect(r.made()).toBe(2);
  });

  test('draws nothing with no width', () => {
    const r = recording();
    ground(r.ctx, 0, 0, 0);
    expect(r.rects).toHaveLength(0);
  });
});
