// The outlines RBF's figures are cut from, in the figure's units: a polygon
// with its corners rounded (a tunic, a robe), a shoe, and a blot (the heads
// are traced from the concept, `traced.ts`). Each is
// a list of points the generator's `piece` runs a smooth path through, dense
// enough along a straight edge that the edge stays straight. Pure.

import { rng } from '@bible/film/core';
import type { Pt } from '../../cold-studies/looks/rive/parts.ts';

/** How far apart points lie along a straight edge, units, so a smooth path keeps it straight. */
const STEP = 40;

/**
 * `corners` (clockwise) with each corner rounded by `r` (no more than a
 * third of either edge), and points along each edge every `STEP` units.
 * `r` is one radius for every corner, or each corner's own, in order.
 */
export const roundedPolygon = (
  corners: ReadonlyArray<Pt>,
  r: number | ReadonlyArray<number>,
): Pt[] => {
  const n = corners.length;
  const none: ReadonlyArray<number> = [];
  const radii = none.concat(r);
  const radius = (i: number) => (radii.length === 1 ? radii[0] : radii[i % n]) ?? 0;
  const out: Pt[] = [];
  corners.forEach((c, i) => {
    const prev = corners[(i - 1 + n) % n] ?? c;
    const next = corners[(i + 1) % n] ?? c;
    const toward = (p: Pt, d: number): Pt => {
      const len = Math.hypot(p[0] - c[0], p[1] - c[1]);
      const k = Math.min(d, len / 3) / len;
      return [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k];
    };
    const a = toward(prev, radius(i));
    const b = toward(next, radius(i));
    out.push(a, [(a[0] + b[0] + 2 * c[0]) / 4, (a[1] + b[1] + 2 * c[1]) / 4], b);
    // The straight run to the next corner's rounding.
    const end = ((): Pt => {
      const after = corners[(i + 2) % n] ?? next;
      const len = Math.hypot(after[0] - next[0], after[1] - next[1]);
      const back = Math.hypot(c[0] - next[0], c[1] - next[1]);
      const k = Math.min(radius(i + 1), back / 3, len / 3) / back;
      return [next[0] + (c[0] - next[0]) * k, next[1] + (c[1] - next[1]) * k];
    })();
    const run = Math.hypot(end[0] - b[0], end[1] - b[1]);
    const steps = Math.floor(run / STEP);
    for (let s = 1; s < steps; s++)
      out.push([b[0] + ((end[0] - b[0]) * s) / steps, b[1] + ((end[1] - b[1]) * s) / steps]);
  });
  return out;
};

/**
 * A shoe as cold-34 cuts it, in shares of its half-width and height: a
 * dome whose widest run is just over the sole, its outer side curving up
 * and in from a rounded toe, its inner side steeper, its crown nearer the
 * inner side (the hem hides it), a flat sole. Clockwise, the toe toward
 * screen left. Traced from cold-34's prosecutor, its ink taken off.
 */
const SHOE: ReadonlyArray<Pt> = [
  [-0.9, 0],
  [-1, -0.06],
  [-1, -0.14],
  [-0.95, -0.28],
  [-0.84, -0.42],
  [-0.69, -0.56],
  [-0.5, -0.69],
  [-0.24, -0.83],
  [0.1, -0.94],
  [0.41, -0.97],
  [0.66, -0.86],
  [0.8, -0.67],
  [0.91, -0.5],
  [0.97, -0.35],
  [1, -0.14],
  [1, -0.06],
  [0.93, 0],
  [0, 0],
];

/**
 * A shoe `w` units across and `h` high (`SHOE`), its sole at y 0 and its
 * middle at x 0, its toe toward screen left (`toe` -1) or right (1).
 */
export const shoeOutline = (w: number, h: number, toe: -1 | 1): Pt[] => {
  const pts = SHOE.map(([x, y]): Pt => [-toe * x * (w / 2), y * h]);
  return toe < 0 ? pts : pts.reverse();
};

/** `pts` moved by (`dx`, `dy`). */
export const shifted = (pts: ReadonlyArray<Pt>, dx: number, dy: number): Pt[] =>
  pts.map(([x, y]): Pt => [x + dx, y + dy]);

/** A blot of half-width `rx` and half-height `ry` about the origin, its outline wandering by `wander` of its radius (seeded). */
export const blotOutline = (rx: number, ry: number, wander: number, seed: number): Pt[] => {
  const r = rng(seed);
  const n = 14;
  return Array.from({ length: n }, (_, i): Pt => {
    const a = (i / n) * 2 * Math.PI;
    const k = 1 + (r() - 0.5) * 2 * wander;
    return [Math.cos(a) * rx * k, Math.sin(a) * ry * k];
  });
};
