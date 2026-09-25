// Hand-drawn ink. Every line is a filled, variable-width polygon whose points
// wobble with noise keyed to `boil` — a counter that ticks at 12 fps, so lines
// "boil" like hand-inked animation on twos while motion stays smooth at 30 fps.

import { hash2, noise1 } from './random.ts';
import { clamp, lerp } from './time.ts';

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
  if (last !== undefined && out[out.length - 1] !== last) out.push(last);
  return out;
};

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

export const cubic = (a: Pt, c1: Pt, c2: Pt, b: Pt, n = 32): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const w0 = u * u * u;
    const w1 = 3 * u * u * t;
    const w2 = 3 * u * t * t;
    const w3 = t * t * t;
    out.push([
      w0 * a[0] + w1 * c1[0] + w2 * c2[0] + w3 * b[0],
      w0 * a[1] + w1 * c1[1] + w2 * c2[1] + w3 * b[1],
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

/** Four slightly overshooting strokes, like a rectangle drawn by hand. */
export const rectStrokes = (x: number, y: number, w: number, h: number, seed = 0): Pt[][] => {
  const o = Math.min(w, h) * 0.04;
  const j = (k: number) => (hash2(seed, k) * 2 - 1) * o;
  return [
    line([x - o + j(1), y + j(2)], [x + w + o + j(3), y + j(4)], 0.01, seed + 1),
    line([x + w + j(5), y - o + j(6)], [x + w + j(7), y + h + o + j(8)], 0.01, seed + 2),
    line([x + w + o + j(9), y + h + j(10)], [x - o + j(11), y + h + j(12)], 0.01, seed + 3),
    line([x + j(13), y + h + o + j(14)], [x + j(15), y - o + j(16)], 0.01, seed + 4),
  ];
};

export const translate = (path: Path, dx: number, dy: number): Pt[] =>
  path.map(([x, y]) => [x + dx, y + dy]);

export const scale = (path: Path, s: number, ox = 0, oy = 0): Pt[] =>
  path.map(([x, y]) => [ox + (x - ox) * s, oy + (y - oy) * s]);

export const rotate = (path: Path, angle: number, ox = 0, oy = 0): Pt[] => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return path.map(([x, y]) => {
    const dx = x - ox;
    const dy = y - oy;
    return [ox + dx * c - dy * s, oy + dx * s + dy * c];
  });
};

/** Linear blend between two paths of equal point count (resample first). */
export const morph = (a: Path, b: Path, t: number): Pt[] => {
  const n = Math.max(a.length, b.length);
  const ra = a.length === n ? a : resampleCount(a, n);
  const rb = b.length === n ? b : resampleCount(b, n);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p = ra[i] ?? [0, 0];
    const q = rb[i] ?? [0, 0];
    out.push([lerp(p[0], q[0], t), lerp(p[1], q[1], t)]);
  }
  return out;
};

/** Resample to exactly `n` points. */
export const resampleCount = (path: Path, n: number): Pt[] => {
  const total = length(path);
  if (total === 0 || n < 2) return [...path];
  const r = resample(path, total / (n - 1));
  while (r.length > n) r.pop();
  const last = path[path.length - 1];
  if (last !== undefined) while (r.length < n) r.push(last);
  return r;
};

// ─── wobble ──────────────────────────────────────────────────────────────────

export interface Hand {
  /** 12 fps tick; lines re-jitter every tick. */
  readonly boil: number;
  readonly seed: number;
}

/** Push each point along its normal by boiling noise. */
const wobble = (pts: ReadonlyArray<Pt>, amp: number, freq: number, hand: Hand): Pt[] => {
  if (amp === 0 || pts.length < 2) return [...pts];
  const out: Pt[] = [];
  let s = 0;
  const phase = hand.boil * 3.7;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i] ?? [0, 0];
    const prev = pts[i - 1] ?? p;
    const next = pts[i + 1] ?? p;
    if (i > 0) s += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    let nx = -(next[1] - prev[1]);
    let ny = next[0] - prev[0];
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const d = amp * noise1(s * freq + phase, hand.seed);
    out.push([p[0] + nx * d, p[1] + ny * d]);
  }
  return out;
};

// ─── stroke ──────────────────────────────────────────────────────────────────

export interface StrokeStyle {
  color: string;
  width: number;
  /** 0→1 draw-on: the stroke grows from its start. */
  progress?: number;
  /** Normal wobble in px. */
  jitter?: number;
  /** Fraction of the length over which each end tapers. */
  taper?: number;
  /** Width variation along the stroke, 0..1. */
  pressure?: number;
  alpha?: number;
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
  const pts = wobble(base, style.jitter ?? 1.1, 0.012, hand);
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
    const next = drawn[i + 1] ?? p;
    if (i > 0) s += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    let nx = -(next[1] - prev[1]);
    let ny = next[0] - prev[0];
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    // Taper the tail against the full stroke, and the head against what has
    // been drawn so far — a growing stroke always has a pointed brush tip.
    const tail = taperCurve(s / (total * taper || 1));
    const head = taperCurve((drawnLen - s) / (total * taper || 1));
    const swell = 1 + pressure * noise1(s * 0.01, hand.seed + 11);
    const w = (style.width / 2) * Math.min(tail, head) * swell;
    left.push([p[0] + nx * w, p[1] + ny * w]);
    right.push([p[0] - nx * w, p[1] - ny * w]);
  }

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

// ─── fills ───────────────────────────────────────────────────────────────────

export interface FillStyle {
  color: string;
  alpha?: number;
  /** Edge wobble in px. */
  jitter?: number;
  /** Offset from the line art, like a print slightly out of register. */
  offset?: Pt;
}

/** A flat fill with a boiling edge. */
export const fill = (ctx: CanvasRenderingContext2D, shape: Path, style: FillStyle, hand: Hand) => {
  if (shape.length < 3) return;
  const closed = [...shape, shape[0] ?? [0, 0]];
  const pts = wobble(resample(closed, 6), style.jitter ?? 1.4, 0.008, hand);
  const [ox, oy] = style.offset ?? [0, 0];
  ctx.save();
  ctx.globalAlpha *= style.alpha ?? 1;
  ctx.fillStyle = style.color;
  ctx.beginPath();
  pts.forEach((p, i) =>
    i === 0 ? ctx.moveTo(p[0] + ox, p[1] + oy) : ctx.lineTo(p[0] + ox, p[1] + oy),
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

/** Parallel hatching clipped to a shape — shade, shadow, stain. */
export const hatch = (
  ctx: CanvasRenderingContext2D,
  shape: Path,
  style: {
    color: string;
    width?: number;
    spacing?: number;
    angle?: number;
    progress?: number;
    alpha?: number;
  },
  hand: Hand,
) => {
  if (shape.length < 3) return;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of shape) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const r = Math.hypot(maxX - minX, maxY - minY) / 2;
  const angle = style.angle ?? -Math.PI / 4;
  const spacing = style.spacing ?? 10;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  ctx.save();
  ctx.beginPath();
  shape.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
  ctx.closePath();
  ctx.clip();
  const count = Math.ceil((2 * r) / spacing);
  const shown = Math.round(count * clamp(style.progress ?? 1));
  for (let i = 0; i < shown; i++) {
    const d = -r + i * spacing;
    const a: Pt = [cx + -s * d - c * r, cy + c * d - s * r];
    const b: Pt = [cx + -s * d + c * r, cy + c * d + s * r];
    stroke(
      ctx,
      line(a, b, 0.01, hand.seed + i),
      {
        color: style.color,
        width: style.width ?? 2,
        jitter: 0.8,
        alpha: style.alpha ?? 1,
        taper: 0.1,
      },
      { boil: hand.boil, seed: hand.seed + i * 13 },
    );
  }
  ctx.restore();
};
