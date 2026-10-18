// The outlines RBF's figures are cut from, in the figure's units: a polygon
// with its corners rounded (a tunic, a robe), a shoe, and a blot (the heads
// are traced from the concept, `traced.ts`). Each is
// a list of points the generator's `piece` runs a smooth path through, dense
// enough along a straight edge that the edge stays straight. Pure.

import { rng } from '@bible/film/core';
import type { Pt } from '@bible/film/style';

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

/** How much of a lit edge's run, from its far end, narrows to nothing, as the concept's light fades toward the crease. */
const FADE = 0.4;

/**
 * The light down a shoe's lit edge (`shoeOutline`, the same `w`, `h` and
 * `toe`), as cold-34 lays it: a band `width` units deep inside the outline
 * along `SHOE`'s points `from` to `to`, whole for most of the run and
 * narrowing to nothing over its last `FADE`. It starts at the sole's
 * corner and runs up, never along the sole, so the sole stays dark. The
 * band reaches 2 units out past the outline, so its piece's clip, not its
 * own edge, draws its outer side.
 */
export const shoeLight = (
  w: number,
  h: number,
  toe: -1 | 1,
  from: number,
  to: number,
  width: number,
): Pt[] => {
  const outline = SHOE.map(([x, y]): Pt => [-toe * x * (w / 2), y * h]);
  const cx = outline.reduce((a, p) => a + p[0], 0) / outline.length;
  const cy = outline.reduce((a, p) => a + p[1], 0) / outline.length;
  const run = Array.from(
    { length: Math.abs(to - from) + 1 },
    (_, k) => from + Math.sign(to - from) * k,
  );
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  run.forEach((i, k) => {
    const p = outline[i] ?? [0, 0];
    const prev = outline[i - 1] ?? p;
    const next = outline[i + 1] ?? p;
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty) || 1;
    const facing = -ty * (cx - p[0]) + tx * (cy - p[1]) < 0 ? -1 : 1;
    const [nx, ny] = [(-ty / len) * facing, (tx / len) * facing];
    const share = k / (run.length - 1);
    const reach = width * Math.min(1, (1 - share) / FADE);
    outer.push([p[0] - nx * 2, p[1] - ny * 2]);
    inner.push([p[0] + nx * reach, p[1] + ny * reach]);
  });
  return [...outer, ...inner.reverse()];
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

// ─── tucking one paper under another ─────────────────────────────────────────

/** Whether `p` lies inside the closed outline `poly`. */
const inside = (p: Pt, poly: ReadonlyArray<Pt>) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i] ?? p;
    const [xj, yj] = poly[j] ?? p;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

/** A point on an outline, its distance from the point it is nearest, and the inward normal of its edge. */
interface Nearest {
  readonly at: Pt;
  readonly d: number;
  readonly n: Pt;
}

/** A point walked along an outline, and whether it was one of the outline's own. */
interface Walked {
  readonly p: Pt;
  readonly cut: boolean;
}

/**
 * The point of the closed outline `poly` nearest `p`, and the unit normal of
 * the edge it lies on, pointing into `poly`; only the edges `only` keeps
 * (by index, the edge from point i to point i + 1) when given.
 */
const nearestEdge = (p: Pt, poly: ReadonlyArray<Pt>, only?: ReadonlyArray<boolean>) => {
  let best: Nearest = { at: p, d: Infinity, n: [0, 0] };
  poly.forEach((a, i) => {
    if (only !== undefined && only[i] !== true) return;
    const b = poly[(i + 1) % poly.length] ?? a;
    const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
    const len2 = ex * ex + ey * ey;
    if (len2 === 0) return;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / len2));
    const at: Pt = [a[0] + ex * t, a[1] + ey * t];
    const d = Math.hypot(p[0] - at[0], p[1] - at[1]);
    if (d >= best.d) return;
    const len = Math.sqrt(len2);
    const n: Pt = [-ey / len, ex / len];
    const into = inside([at[0] + n[0] * 0.5, at[1] + n[1] * 0.5], poly) ? 1 : -1;
    best = { at, d, n: [n[0] * into, n[1] * into] };
  });
  return best;
};

/** `pts` (closed) with points added along each edge so none is longer than `step`; each says whether it was one of `pts`. */
const resampled = (pts: ReadonlyArray<Pt>, step: number) =>
  pts.flatMap((a, i) => {
    const b = pts[(i + 1) % pts.length] ?? a;
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    return Array.from({ length: n }, (_, k): Walked => ({
      p: [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n],
      cut: k === 0,
    }));
  });

/**
 * How a paper tucks under the papers laid over it: `depth` units under
 * their edge, for the points of its outline that come within `reach` of
 * that edge (outside it, or inside by less than `depth`), easing out over
 * the last half of `reach`; the outline is walked every `step` units, and
 * a walked point stays only where it moved. Each piece's outline crawls on
 * the boil on its own, and the smooth path bows between points: two papers
 * whose edges meet show the one behind in a sliver, so the paper behind
 * lies well under the one in front wherever they meet.
 */
const TUCK = { depth: 3.5, reach: 5, step: 3 } as const;

/** One walked point of a paper, tucked under `fronts` (`tucked`): kept, moved, or dropped. */
const tuckOne = ({ p, cut }: Walked, fronts: ReadonlyArray<ReadonlyArray<Pt>>): Pt[] => {
  let best: { readonly to: Pt; readonly w: number } | undefined;
  for (const front of fronts) {
    const e = nearestEdge(p, front);
    const under = inside(p, front) ? e.d : -e.d;
    if (under >= TUCK.depth) return cut ? [p] : [];
    if (under <= -TUCK.reach) continue;
    const t = Math.max(0, Math.min(1, (under + TUCK.reach) / (TUCK.reach / 2)));
    const w = t * t * (3 - 2 * t);
    if (best !== undefined && best.w >= w) continue;
    best = { to: [e.at[0] + e.n[0] * TUCK.depth, e.at[1] + e.n[1] * TUCK.depth], w };
  }
  if (best === undefined || best.w === 0) return cut ? [p] : [];
  const { to, w } = best;
  return [[+(p[0] + (to[0] - p[0]) * w).toFixed(2), +(p[1] + (to[1] - p[1]) * w).toFixed(2)]];
};

/**
 * `back` tucked under `fronts`: each point near a front paper's edge moved
 * `TUCK.depth` under it, so no sliver of `back` shows between them or round
 * the silhouette they share (see `TUCK`).
 */
export const tucked = (back: ReadonlyArray<Pt>, fronts: ReadonlyArray<ReadonlyArray<Pt>>): Pt[] =>
  resampled(back, TUCK.step).flatMap((w) => tuckOne(w, fronts));

/** How far inside `back` a front's edge lies to be a seam over it rather than its silhouette, units. */
const SEAM = 1.5;

/**
 * Which edges of `front` are seams over `back`: those whose middle lies
 * inside `back`, more than `SEAM` from its outline. The rest lie on the
 * silhouette the two share, or past it.
 */
const seamsOf = (front: ReadonlyArray<Pt>, back: ReadonlyArray<Pt>) =>
  front.map((a, i) => {
    const b = front[(i + 1) % front.length] ?? a;
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return inside(mid, back) && nearestEdge(mid, back).d > SEAM;
  });

/**
 * A paper that draws a rim along its whole outline, tucked under `fronts`:
 * where it lies under a front, `deep` under that front's seams over it (its
 * rim's width and more), so its rim shows only on the silhouette, never at
 * a seam. A point under a front too narrow to hold it `deep` from a seam (a
 * lock's tip) stays where it is, on the silhouette under the front's outer
 * edge, so the rim there tapers out under the tip. A point outside every
 * front tucks as `tucked` tucks it.
 */
export const tuckedRimmed = (
  back: ReadonlyArray<Pt>,
  fronts: ReadonlyArray<ReadonlyArray<Pt>>,
  deep: number,
): Pt[] => {
  const seams = fronts.map((front) => seamsOf(front, back));
  return resampled(back, TUCK.step).flatMap((walked): Pt[] => {
    const { p, cut } = walked;
    const keep = (): Pt[] => (cut ? [p] : []);
    const under = fronts.findIndex((front) => inside(p, front));
    const front = fronts[under];
    if (front === undefined) return tuckOne(walked, fronts);
    const e = nearestEdge(p, front, seams[under]);
    if (e.d >= deep) return keep();
    const to: Pt = [e.at[0] + e.n[0] * deep, e.at[1] + e.n[1] * deep];
    if (!inside(to, front) || nearestEdge(to, front).d < TUCK.depth) return keep();
    return [[+to[0].toFixed(2), +to[1].toFixed(2)]];
  });
};
