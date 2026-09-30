// The backdrop's fibre is the paper's own: wherever the camera looks and
// however close, each point of the plane shows the grain at that point's own
// place in the tile. The stand-in records the one pattern fill `planeFibre`
// lays (its tile, so the period, and its whole-pixel offset), and the test
// reads back which tile point lands under a world point at the frame's edge,
// where a period rounded to a whole px drifts farthest from the plane.

import { describe, expect, test } from 'bun:test';
import type { Camera } from './camera.ts';
import { FIBRE_SIZE, planeFibre } from './fibre.ts';
import { isPattern, recorder, withDom } from './fixtures/stand-in.ts';

const W = 1920;
const H = 1080;

/** `n` wrapped into [0, period). */
const wrap = (n: number, period: number) => ((n % period) + period) % period;

/**
 * How far, in frame px, the fibre under world point `p` (one axis) sits from
 * where the plane carries that point's grain: the tile point laid under `p`'s
 * frame position against `p`'s own place in the tile, scaled to the period.
 */
const driftAt = (view: Camera, p: number) => {
  const r = recorder(W, H);
  withDom(() => planeFibre(r.ctx, view, W, H));
  const fill = r.fills[0];
  const period = fill !== undefined && isPattern(fill.style) ? fill.style.tile.width : 0;
  expect(period).toBeGreaterThan(0);
  const zoom = view.zoom ?? 1;
  const screen = W / 2 + zoom * (p - view.x);
  const laid = wrap(screen - (fill?.m[4] ?? 0), period);
  const own = (wrap(p, FIBRE_SIZE) / FIBRE_SIZE) * period;
  const off = Math.abs(laid - own);
  return Math.min(off, period - off);
};

/** The world x at the frame's left and right edges, seen through `view`. */
const edges = (view: Camera): readonly [number, number] => {
  const zoom = view.zoom ?? 1;
  return [view.x - W / 2 / zoom, view.x + W / 2 / zoom];
};

describe('planeFibre', () => {
  // A period rounded to a whole px is off the plane's own by up to half a px
  // a tile; laid from a tile corner at the frame's middle, the frame's edge
  // is about three tiles out at zoom 1, so the grain there sits within 2 px.
  for (const zoom of [1, 1.03, 1.37, 2.46])
    for (const x of [960, 2400, -1700])
      test(`holds the grain at the frame's edge with the plane at zoom ${zoom}, looking at x ${x}`, () => {
        const view: Camera = { x, y: 540, zoom };
        for (const p of edges(view)) expect(driftAt(view, p)).toBeLessThanOrEqual(2);
      });
});
