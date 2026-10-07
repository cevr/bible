// Hand-drawn ink. Every line is a filled, variable-width polygon whose points
// wobble with noise keyed to `boil` — a counter that ticks at 12 fps, so lines
// "boil" like hand-inked animation on twos while motion stays smooth at 30 fps.

import { type Vec2, vec2 } from 'math';
import { probeOf, recordInk } from './probe.ts';
import { hash2, noise1 } from '../core/random.ts';
import { clamp, frameAtOrBefore, lerp } from '../core/time.ts';

export type Pt = readonly [number, number];
export type Path = ReadonlyArray<Pt>;

// ─── path builders ───────────────────────────────────────────────────────────

/** Evenly spaced points along a polyline. */
export const resample = (path: Path, spacing = 4): Pt[] => {
  const first = path[0];
  if (first === undefined) return [];
  const out: Pt[] = [first];
  let carry = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (a === undefined || b === undefined) continue;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let d = spacing - carry;
    while (d <= seg) {
      const t = d / seg;
      out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
      d += spacing;
    }
    carry = seg - (d - spacing);
  }
  const last = path[path.length - 1];
  if (last === undefined) return out;
  // A path a whole number of spacings long put its last point there already.
  if (carry < ON_END) out[out.length - 1] = last;
  else out.push(last);
  return out;
};

/** How near the last spaced point may fall to the path's end and be its end (px). */
const ON_END = 1e-6;

export const length = (path: Path): number => {
  let sum = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (a !== undefined && b !== undefined) sum += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return sum;
};

/** A straight line with a slight hand bow. */
export const line = (a: Pt, b: Pt, bow = 0.02, seed = 0): Pt[] => {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const k = bow * (hash2(seed, 1) * 2 - 1);
  const c: Pt = [mx - dy * k, my + dx * k];
  return quad(a, c, b);
};

export const quad = (a: Pt, c: Pt, b: Pt, n = 24): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([
      u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
    ]);
  }
  return out;
};

/** A smooth curve through every given point (Catmull-Rom). */
export const spline = (pts: Path, perSeg = 12, closed = false): Pt[] => {
  const n = pts.length;
  if (n < 3) return [...pts];
  const at = (i: number): Pt => {
    const j = closed ? ((i % n) + n) % n : clamp(i, 0, n - 1);
    return pts[j] ?? pts[0] ?? [0, 0];
  };
  const out: Pt[] = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(closed ? at(0) : at(n - 1));
  return out;
};

/**
 * A hand-drawn ellipse: it starts at a seeded angle and overshoots its start,
 * the way a pen never quite closes a circle.
 */
export const ellipse = (
  cx: number,
  cy: number,
  rx: number,
  ry = rx,
  seed = 0,
  overshoot = 0.18,
): Pt[] => {
  const start = hash2(seed, 7) * Math.PI * 2;
  const sweep = Math.PI * 2 + overshoot;
  const n = Math.max(24, Math.round((rx + ry) * 0.25));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = start + (sweep * i) / n;
    const r = 1 + 0.025 * noise1(i * 0.35, seed);
    out.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
  }
  return out;
};

/** A closed ellipse (no overshoot) — for fills. */
export const ellipseShape = (cx: number, cy: number, rx: number, ry = rx, n = 48): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
};

export const rectShape = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

/** A rectangle centred on (x, y), `w` by `h`: a text plate's shape, drawn by `piece` and declared by `probePlate`. */
export const plate = (x: number, y: number, w: number, h: number): Pt[] =>
  rectShape(x - w / 2, y - h / 2, w, h);

/** A rectangle centred on (x, y) with corners rounded to `r`. */
export const rounded = (x: number, y: number, w: number, h: number, r: number): Pt[] => {
  const k = Math.min(r, w / 2, h / 2);
  const corner = (cx: number, cy: number, from: number): Pt[] =>
    Array.from({ length: 7 }, (_, i): Pt => {
      const a = from + (Math.PI / 2) * (i / 6);
      return [cx + Math.cos(a) * k, cy + Math.sin(a) * k];
    });
  const l = x - w / 2 + k;
  const rr = x + w / 2 - k;
  const t = y - h / 2 + k;
  const b = y + h / 2 - k;
  return [
    ...corner(rr, t, -Math.PI / 2),
    ...corner(rr, b, 0),
    ...corner(l, b, Math.PI / 2),
    ...corner(l, t, Math.PI),
  ];
};

/** An irregular round patch (a stain, a speck, a flake), centred on (x, y), its wobble seeded by `seed`. */
export const blob = (x: number, y: number, w: number, h: number, seed: number): Pt[] =>
  spline(
    Array.from({ length: 11 }, (_, i): Pt => {
      const a = (2 * Math.PI * i) / 11;
      const k = 0.78 + 0.3 * hash2(i, seed);
      return [x + ((Math.cos(a) * w) / 2) * k, y + ((Math.sin(a) * h) / 2) * k];
    }),
    6,
    true,
  );

// ─── wobble ──────────────────────────────────────────────────────────────────

/** Scratch for the unit normal at each point, written and read within one step. */
const normal: Vec2 = [0, 0];

/** How many times a second the ink boils: every line re-jitters on each tick. */
export const BOIL_FPS = 12;

/** The boil tick at film second `T`: the frame the compositor and a short both draw it on. */
export const boilTick = (T: number): number => frameAtOrBefore(T, BOIL_FPS);

export interface Hand {
  /** The boil tick (`BOIL_FPS` a second); lines re-jitter every tick. */
  readonly boil: number;
  readonly seed: number;
}

/** A sub-hand: the same boil on seed `hand.seed + k`, so each piece of a drawing boils on its own. */
export const sub = (hand: Hand, k: number): Hand => ({ boil: hand.boil, seed: hand.seed + k });

/**
 * How a line boils (DIRECTION, "Boil"): `tick` redraws its wobble on every
 * boil tick, as ink does; `crawl` lets it wander slowly, as a figure's line
 * may, each point moving at most `CRAWL_MAX` px a tick at the stroke's usual
 * jitter; `none` holds it, as scenery's is. The wobble itself stays: a held
 * line is still drawn by hand.
 */
export type Boil = 'tick' | 'crawl' | 'none';

/** How far a tick moves the boil noise's phase: past a whole cell, so each tick is a new line. */
const TICK_PHASE = 3.7;

/** The steepest the boil noise changes per unit of phase (value noise under smoothstep). */
const NOISE_SLOPE = 3;

/** The most a crawling line's point moves in one tick at `STROKE_JITTER`, in px (the direction's "about 0.3 px"). */
export const CRAWL_MAX = 0.3;

/**
 * Where tick `tick` puts the boil noise's phase, for a line boiling as
 * `boil`, whose ticks otherwise move it `perTick`. A crawl steps the phase so
 * a point at `STROKE_JITTER` moves at most `CRAWL_MAX` a tick.
 */
export const boilPhase = (boil: Boil, tick: number, perTick = TICK_PHASE): number => {
  if (boil === 'none') return 0;
  if (boil === 'tick') return tick * perTick;
  return tick * (CRAWL_MAX / (STROKE_JITTER * NOISE_SLOPE));
};

/**
 * Write into `normal` the unit normal at point `i` of `pts`. On a ring (whose
 * last point is its first) the ends take their neighbours across the seam,
 * so the two ends of the ring face the same way.
 */
const normalAt = (pts: ReadonlyArray<Pt>, i: number, ring: boolean) => {
  const last = pts.length - 1;
  const p = pts[i] ?? [0, 0];
  const before = ring && i === 0 ? last - 1 : i - 1;
  const after = ring && i === last ? 1 : i + 1;
  const prev = pts[before] ?? p;
  const next = pts[after] ?? p;
  normal[0] = -(next[1] - prev[1]);
  normal[1] = next[0] - prev[0];
  vec2.normalize(normal, normal);
};

/**
 * Noise along a line at arc length `s` of `len`, as `noise1(s * freq + phase)`;
 * on a ring, blended with the lap before it so the end joins the start.
 */
const alongNoise = (
  s: number,
  len: number,
  freq: number,
  phase: number,
  seed: number,
  ring: boolean,
) => {
  const here = noise1(s * freq + phase, seed);
  if (!ring || len <= 0) return here;
  const u = s / len;
  return here * (1 - u) + noise1((s - len) * freq + phase, seed) * u;
};

/** Push each point along its normal by boiling noise at `phase`. */
const wobble = (
  pts: ReadonlyArray<Pt>,
  amp: number,
  freq: number,
  hand: Hand,
  phase: number,
  ring: boolean,
): Pt[] => {
  if (amp === 0 || pts.length < 2) return [...pts];
  const len = ring ? length(pts) : 0;
  const out: Pt[] = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i] ?? [0, 0];
    const prev = pts[i - 1] ?? p;
    if (i > 0) s += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    normalAt(pts, i, ring);
    const d = amp * alongNoise(s, len, freq, phase, hand.seed, ring);
    out.push([p[0] + normal[0] * d, p[1] + normal[1] * d]);
  }
  return out;
};

// ─── stroke ──────────────────────────────────────────────────────────────────

/**
 * A stroke's normal wobble, in its own px, unless its style sets `jitter`:
 * each point sits up to this far off the path, so between two boil ticks it
 * moves up to twice this.
 */
export const STROKE_JITTER = 1.1;

export interface StrokeStyle {
  color: string;
  width: number;
  /** 0→1 draw-on: the stroke grows from its start. */
  progress?: number;
  /** Normal wobble in px. */
  jitter?: number;
  /** How the line boils: `tick` (ink, the default), `crawl` (a figure's line), `none` (scenery). */
  boil?: Boil;
  /** Fraction of the length over which each end tapers. */
  taper?: number;
  /**
   * The path returns to its start (an outline, a ring): once drawn whole, it
   * has no ends, so nothing tapers and its wobble and swell run on round the
   * seam with no notch.
   */
  closed?: boolean;
  /** Width variation along the stroke, 0..1. */
  pressure?: number;
  alpha?: number;
  /**
   * The lines of text this stroke marks on purpose (a strike through one, a
   * ring round it, an underline), each named by the hand that wrote it: the
   * very `f.hand(key)` passed to `write`. `film check` lets it cross those
   * lines; any other text it crosses is a finding, even the same words written
   * by another hand. Changes nothing drawn.
   */
  marks?: ReadonlyArray<Hand>;
}

/**
 * Draw a brush stroke along `path`. The stroke is a filled polygon whose width
 * swells and tapers, so it reads as ink rather than as a vector hairline.
 */
export const stroke = (
  ctx: CanvasRenderingContext2D,
  path: Path,
  style: StrokeStyle,
  hand: Hand,
) => {
  const progress = style.progress ?? 1;
  if (progress <= 0 || path.length < 2) return;
  const base = resample(path, Math.max(2, style.width * 0.6));
  // A ring only once it is drawn whole: while it draws on, it has a tip.
  const ring = style.closed === true && progress >= 1;
  const pts = wobble(
    base,
    style.jitter ?? STROKE_JITTER,
    0.012,
    hand,
    boilPhase(style.boil ?? 'tick', hand.boil),
    ring,
  );
  const total = length(pts);
  const drawn = trim(pts, total * clamp(progress));
  if (drawn.length < 2) return;

  const taper = style.taper ?? 0.18;
  const pressure = style.pressure ?? 0.3;
  const drawnLen = length(drawn);
  const left: Pt[] = [];
  const right: Pt[] = [];
  let s = 0;
  for (let i = 0; i < drawn.length; i++) {
    const p = drawn[i] ?? [0, 0];
    const prev = drawn[i - 1] ?? p;
    if (i > 0) s += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    normalAt(drawn, i, ring);
    const nx = normal[0];
    const ny = normal[1];
    // Taper the tail against the full stroke, and the head against what has
    // been drawn so far — a growing stroke always has a pointed brush tip.
    // A ring has no ends to taper.
    const tail = ring ? 1 : taperCurve(s / (total * taper || 1));
    const head = ring ? 1 : taperCurve((drawnLen - s) / (total * taper || 1));
    const swell = 1 + pressure * alongNoise(s, drawnLen, 0.01, 0, hand.seed + 11, ring);
    const w = (style.width / 2) * Math.min(tail, head) * swell;
    left.push([p[0] + nx * w, p[1] + ny * w]);
    right.push([p[0] - nx * w, p[1] - ny * w]);
  }

  inkOutline(ctx, left, right, drawn, style);
};

/** Fill the stroke's outline: down its `left` edge and back up its `right`. */
const inkOutline = (
  ctx: CanvasRenderingContext2D,
  left: Path,
  right: Path,
  drawn: Path,
  style: StrokeStyle,
) => {
  ctx.save();
  ctx.globalAlpha *= style.alpha ?? 1;
  ctx.fillStyle = style.color;
  ctx.beginPath();
  const l0 = left[0] ?? [0, 0];
  ctx.moveTo(l0[0], l0[1]);
  for (const p of left) ctx.lineTo(p[0], p[1]);
  for (let i = right.length - 1; i >= 0; i--) {
    const p = right[i] ?? [0, 0];
    ctx.lineTo(p[0], p[1]);
  }
  ctx.closePath();
  ctx.fill();
  const probe = probeOf(ctx);
  if (probe !== undefined)
    recordInk(
      ctx,
      probe,
      'stroke',
      drawn,
      style.width,
      ctx.globalAlpha,
      style.marks?.map((h) => h.seed),
    );
  ctx.restore();
};

/** Ends thin to 35% of the width, not to nothing — a loaded brush. */
const taperCurve = (u: number) => {
  const t = clamp(u);
  return 0.35 + 0.65 * (t * t * (3 - 2 * t));
};

/** The first `len` px of a polyline. */
export const trim = (pts: Path, len: number): Pt[] => {
  const first = pts[0];
  if (first === undefined) return [];
  const out: Pt[] = [first];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] ?? first;
    const b = pts[i] ?? first;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + seg >= len) {
      const t = seg === 0 ? 0 : (len - acc) / seg;
      out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
      return out;
    }
    acc += seg;
    out.push(b);
  }
  return out;
};
