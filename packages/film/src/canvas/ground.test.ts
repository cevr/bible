// A contact shadow is a flat warm ellipse under the feet: it lands where it
// is put, lies flat, stays within the direction's darkness, and makes its
// gradient once per context rather than every frame. Drawn into the
// stand-in, which records each fill's gradient and its transform.

import { describe, expect, test } from 'bun:test';
import { type Style, isRadial, recorder } from './fixtures/stand-in.ts';
import { GROUND_ALPHA, GROUND_FLAT, ground } from './ground.ts';

const alphaOf = (color: string) => Number(color.split(',').at(-1)?.replace(')', ''));

/** The radial gradient a fill was made with. */
const radialOf = (style: Style | undefined) =>
  style !== undefined && isRadial(style) ? style : undefined;

describe('ground', () => {
  test('lies flat under the point it is given, as wide as asked', () => {
    const r = recorder();
    ground(r.ctx, 500, 800, 200);
    expect(r.fills).toHaveLength(1);
    const [fill] = r.fills;
    expect(fill?.rect).toEqual([-1, -1, 2, 2]);
    expect(fill?.m).toEqual([100, 0, 0, 100 * GROUND_FLAT, 500, 800]);
  });

  test('is darkest under the feet, within 15–30 %, and gone at its rim', () => {
    const r = recorder();
    ground(r.ctx, 0, 0, 100);
    const stops = radialOf(r.fills[0]?.style)?.stops ?? [];
    const alphas = stops.map(([, color]) => alphaOf(color));
    expect(alphas[0]).toBe(GROUND_ALPHA);
    expect(GROUND_ALPHA).toBeGreaterThanOrEqual(0.15);
    expect(GROUND_ALPHA).toBeLessThanOrEqual(0.3);
    expect(alphas.at(-1)).toBe(0);
    expect(stops.at(-1)?.[0]).toBe(1);
  });

  test('makes its gradient once per context, however many frames and widths', () => {
    const r = recorder();
    for (let i = 0; i < 30; i++) ground(r.ctx, i, 0, 50 + i);
    expect(new Set(r.fills.map((f) => f.style)).size).toBe(1);
    const other = recorder();
    ground(other.ctx, 0, 0, 50);
    expect(other.fills[0]?.style).not.toBe(r.fills[0]?.style);
  });

  test('draws nothing with no width', () => {
    const r = recorder();
    ground(r.ctx, 0, 0, 0);
    expect(r.fills).toHaveLength(0);
  });
});
