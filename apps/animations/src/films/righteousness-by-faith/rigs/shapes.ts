// The outlines RBF's figures are cut from, in the figure's units: a polygon
// with its corners rounded (a tunic, a robe), a head squared off with a jaw,
// hair laid flat over the top of a head, and a blot. Each is a list of points the generator's `piece` runs
// a smooth path through, dense enough along a straight edge that the edge
// stays straight. Pure.

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

/** How a head's hair lies: how far down its sides it reaches, where its hairline crosses the brow, and its curl. */
export interface Hair {
  /** Radians below the head's equator the hair's sides reach. */
  readonly sides: number;
  /** The hairline across the brow, as a share of the head's half-height above its centre. */
  readonly line: number;
  /** How far past the head's outline the hair stands, as a share of its radius. */
  readonly loft: number;
  /** Curls round the top, and how deep each is, as a share of the radius (0: smooth). */
  readonly curls: number;
  readonly curl: number;
  /** The fringe's sweep: how far the hairline's middle dips toward one side, units (0: level). */
  readonly sweep?: number;
  /** One swept point at the back of the crown, as a share of the radius it stands out (0: none). */
  readonly tuft?: number;
  /** The head's squareness it follows (`Head.power`; 2, the default, a round head). */
  readonly power?: number;
}

/**
 * How a head is squared (all shares of its half-height and half-width): its
 * superellipse's power (2 round, past 2 squarer), where its jaw starts
 * narrowing below its middle, and the chin's width against the head's.
 */
export interface Head {
  readonly power: number;
  readonly jaw: number;
  readonly chin: number;
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
    const narrow = down > head.jaw ? (1 - head.chin) * ((down - head.jaw) / (1 - head.jaw)) : 0;
    return [x * (1 - narrow), y];
  });
};

/** Where the tuft stands on the crown (radians, y down: the top is −π/2), and its half-width. */
const TUFT = { at: -Math.PI / 4, half: 0.28 } as const;

/**
 * Hair laid flat over the head of half-width `rx` and half-height `ry`
 * centred at the origin: round the top past the head's outline, down its
 * sides, and back across the brow along the hairline.
 */
export const hairOutline = (rx: number, ry: number, hair: Hair): Pt[] => {
  const out: Pt[] = [];
  const from = Math.PI - hair.sides;
  const to = 2 * Math.PI + hair.sides;
  const n = 28;
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    const curl =
      hair.curls > 0
        ? hair.curl * Math.abs(Math.sin(((a - from) / (to - from)) * Math.PI * hair.curls))
        : 0;
    const near = 1 - Math.abs(normalAngle(a - TUFT.at)) / TUFT.half;
    const tuft = (hair.tuft ?? 0) * Math.max(0, near) ** 1.6;
    const k = 1 + hair.loft + curl + tuft;
    const [x, y] = onSuper(a, rx * k, ry * k, hair.power ?? 2);
    out.push([x, y]);
  }
  // Back across the brow: from the right side's foot, inside the head, to the left's.
  const y = -ry * hair.line;
  const foot = Math.sin(hair.sides) * ry;
  const edge = rx * 0.86;
  const sweep = hair.sweep ?? 0;
  out.push([edge, foot * 0.6]);
  out.push([edge * 0.9, y + (foot - y) * 0.25]);
  for (let i = 1; i < 6; i++) {
    const x = edge * 0.8 * (1 - (2 * i) / 6);
    const dip = sweep * Math.sin((i / 6) * Math.PI);
    out.push([x, y + dip + 0.06 * ry * Math.cos((i / 6) * Math.PI) ** 2]);
  }
  out.push([-edge * 0.9, y + (foot - y) * 0.25]);
  out.push([-edge, foot * 0.6]);
  return out;
};

/** `a` turned into −π..π. */
const normalAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

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
