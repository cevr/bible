// The outlines RBF's figures are cut from, in the figure's units: a polygon
// with its corners rounded (a tunic, a robe), a head squared off with a jaw
// and turned three-quarters, hair capping a turned head, and a blot. Each is
// a list of points the generator's `piece` runs a smooth path through, dense
// enough along a straight edge that the edge stays straight. Pure.

import { rng } from '@bible/film/core';
import type { Pt } from '../../cold-studies/looks/rive/parts.ts';

/** How far apart points lie along a straight edge, units, so a smooth path keeps it straight. */
const STEP = 40;

/**
 * `corners` (clockwise) with each corner rounded by `r` (no more than a
 * third of either edge), and points along each edge every `STEP` units.
 */
export const roundedPolygon = (corners: ReadonlyArray<Pt>, r: number): Pt[] => {
  const n = corners.length;
  const out: Pt[] = [];
  corners.forEach((c, i) => {
    const prev = corners[(i - 1 + n) % n] ?? c;
    const next = corners[(i + 1) % n] ?? c;
    const toward = (p: Pt, d: number): Pt => {
      const len = Math.hypot(p[0] - c[0], p[1] - c[1]);
      const k = Math.min(d, len / 3) / len;
      return [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k];
    };
    const a = toward(prev, r);
    const b = toward(next, r);
    out.push(a, [(a[0] + b[0] + 2 * c[0]) / 4, (a[1] + b[1] + 2 * c[1]) / 4], b);
    // The straight run to the next corner's rounding.
    const end = ((): Pt => {
      const after = corners[(i + 2) % n] ?? next;
      const len = Math.hypot(after[0] - next[0], after[1] - next[1]);
      const back = Math.hypot(c[0] - next[0], c[1] - next[1]);
      const k = Math.min(r, back / 3, len / 3) / back;
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
 * How a head is squared (all shares of its half-height and half-width): its
 * superellipse's power (2 round, past 2 squarer), where its jaw starts
 * narrowing below its middle, and the chin's width against the head's. A
 * head turned three-quarters toward screen left (`turn`) carries its chin
 * that share of its half-width to the left, and its jaw starts narrowing
 * `back` higher on the far side, toward the ear.
 */
export interface Head {
  readonly power: number;
  readonly jaw: number;
  readonly chin: number;
  readonly turn?: number;
  readonly back?: number;
}

/** A point at angle `a` on the superellipse of power `n` and half-sizes `rx`, `ry`. */
const onSuper = (a: number, rx: number, ry: number, n: number): Pt => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [Math.sign(c) * Math.abs(c) ** (2 / n) * rx, Math.sign(s) * Math.abs(s) ** (2 / n) * ry];
};

/**
 * A head of half-width `rx` and half-height `ry` about the origin, squared
 * by `head.power`, its sides drawing in from `head.jaw` below its middle to
 * a chin `head.chin` of its width: the concept's rounded-rectangle heads.
 */
export const headOutline = (rx: number, ry: number, head: Head): Pt[] => {
  const n = 36;
  return Array.from({ length: n }, (_, i): Pt => {
    const [x, y] = onSuper((i / n) * 2 * Math.PI, rx, ry, head.power);
    const down = y / ry;
    const jaw = head.jaw - (head.back ?? 0) * Math.max(0, x / rx);
    const t = down > jaw ? (down - jaw) / (1 - jaw) : 0;
    return [x * (1 - (1 - head.chin) * t) - (head.turn ?? 0) * rx * t, y];
  });
};

/**
 * Hair capping a head turned three-quarters toward screen left, as the
 * concept draws it: round the crown past the head's outline (`loft`),
 * standing further out over the back of the head (`back`), from where it
 * meets the outline on the face's side (`front`, radians above the
 * equator) to where it meets it behind (`rear`, radians below); then in
 * along the nape to the top of the ear (`temple`, `nape`), up to the
 * hairline at the temple (`line`) and across the brow to the front, where
 * it may sit lower (`brow`, `line` when left out). `lumps` waves its crown
 * (`lump` deep); `forelock` stands it out at the front.
 * Shares of the head's half-width and half-height.
 */
export interface Cap {
  readonly power: number;
  readonly loft: number;
  readonly back: number;
  readonly front: number;
  readonly rear: number;
  readonly line: number;
  readonly brow?: number;
  readonly temple: number;
  readonly nape: number;
  readonly lumps?: number;
  readonly lump?: number;
  readonly forelock?: number;
}

/** Points every `STEP / 2` units from `a` to `b`, `a` left out and `b` kept. */
const along = (a: Pt, b: Pt): Pt[] => {
  const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (STEP / 2)));
  return Array.from({ length: steps }, (_, i): Pt => {
    const k = (i + 1) / steps;
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  });
};

/** The hair `cap` over the head of half-width `rx` and half-height `ry` about the origin (`Cap`). */
export const capOutline = (rx: number, ry: number, cap: Cap): Pt[] => {
  const from = Math.PI + cap.front;
  const to = 2 * Math.PI + cap.rear;
  const n = 30;
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const share = i / n;
    const a = from + (to - from) * share;
    const wave = (cap.lump ?? 0) * Math.abs(Math.sin(share * Math.PI * (cap.lumps ?? 0)));
    const lock = (cap.forelock ?? 0) * Math.max(0, 1 - share * 6);
    const k = 1 + cap.loft + cap.back * Math.max(0, Math.cos(a)) + wave + lock;
    out.push(onSuper(a, rx * k, ry * k, cap.power));
  }
  // In from behind: along the nape to the top of the ear, up to the hairline, across the brow.
  const foot = onSuper(to, rx * 0.96, ry * 0.96, cap.power);
  const ear: Pt = [cap.temple * rx, cap.nape * ry];
  const temple: Pt = [cap.temple * rx, -cap.line * ry];
  const brow: Pt = [onSuper(from, rx, ry, cap.power)[0] * 0.92, -(cap.brow ?? cap.line) * ry];
  const start = out[out.length - 1] ?? foot;
  return [
    ...out,
    ...along(start, foot),
    ...along(foot, ear),
    ...along(ear, temple),
    ...along(temple, brow).slice(0, -1),
  ];
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
