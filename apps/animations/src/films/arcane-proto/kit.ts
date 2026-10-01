// The prototype's drawing kit: people as painted shapes (seated, wrapped in
// a cloak, a head or a headcloth), lit by a rim, and the brushes its plates
// are painted with. A figure is a shape, not a puppet: it is lit by two
// fills, its shade and its light offset toward the light inside it, so a
// thin crescent of light runs down the side the light comes from.

import type { Brush, Hex } from '@bible/film/canvas';

/** A shape built on the context's path (begun, not filled). */
export type Shape = (ctx: CanvasRenderingContext2D) => void;

/**
 * Fill `shape` in `light`, then, inside it, the same shape in `body` shifted
 * away from the light by (`dx`, `dy`): the light shows only on the side it
 * comes from, as a rim as wide as the shift.
 */
export const rimmed = (
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  body: string | CanvasGradient,
  light: string | CanvasGradient,
  dx: number,
  dy: number,
) => {
  ctx.save();
  ctx.beginPath();
  shape(ctx);
  ctx.fillStyle = light;
  ctx.fill();
  ctx.clip();
  ctx.translate(dx, dy);
  ctx.beginPath();
  shape(ctx);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.restore();
};

/** How a seated figure is cut: where it sits, how tall, which way it faces. */
export interface Seat {
  readonly x: number;
  readonly y: number;
  /** Seated height, base to crown, in px. */
  readonly h: number;
  /** 1 faces right, −1 left. */
  readonly dir: 1 | -1;
  /** A headcloth over the head and shoulders, rather than a bare head. */
  readonly cloth?: boolean;
  /** The head's tilt, in radians (a listener leaning in). */
  readonly lean?: number;
}

/**
 * A seated figure in a cloak, seen from the side: its back, its knees drawn
 * up in front and its head, one closed shape (the head joins the shoulders
 * by a neck, or under a headcloth by the cloth's fall).
 */
export const seated =
  (s: Seat): Shape =>
  (ctx) => {
    const { x, y, h, dir } = s;
    const X = (u: number) => x + dir * u * h;
    const Y = (v: number) => y - v * h;
    const lean = (s.lean ?? 0) * h;
    // The body: back, seat, knees, lap and chest, up to the shoulders.
    ctx.moveTo(X(-0.2), Y(0));
    ctx.quadraticCurveTo(X(-0.27), Y(0.35), X(-0.15), Y(0.64));
    ctx.quadraticCurveTo(X(-0.02), Y(0.72), X(0.14), Y(0.62));
    ctx.quadraticCurveTo(X(0.2), Y(0.45), X(0.16), Y(0.34));
    ctx.quadraticCurveTo(X(0.33), Y(0.3), X(0.4), Y(0.18));
    ctx.quadraticCurveTo(X(0.44), Y(0.04), X(0.36), Y(0));
    ctx.closePath();
    // The head, leaning forward by `lean`.
    const hx = X(0.04) + dir * lean;
    const hy = Y(0.8) + Math.abs(lean) * 0.3;
    if (s.cloth === true) {
      ctx.moveTo(hx - dir * 0.15 * h, Y(0.6));
      ctx.quadraticCurveTo(hx - dir * 0.17 * h, hy - 0.13 * h, hx, hy - 0.13 * h);
      ctx.quadraticCurveTo(hx + dir * 0.13 * h, hy - 0.12 * h, hx + dir * 0.11 * h, hy + 0.02 * h);
      ctx.quadraticCurveTo(hx + dir * 0.1 * h, hy + 0.12 * h, X(0.12), Y(0.62));
      ctx.closePath();
    } else {
      ctx.moveTo(hx + 0.105 * h, hy);
      ctx.ellipse(hx, hy, 0.095 * h, 0.11 * h, 0, 0, Math.PI * 2);
      ctx.moveTo(hx - 0.05 * h, hy + 0.06 * h);
      ctx.rect(hx - 0.045 * h, hy + 0.04 * h, 0.09 * h, 0.12 * h);
    }
  };

/** The brushes the plates are painted with, by how near they stand. */
export const brushes = {
  /** Air and sky: long, soft, lying with the horizon. */
  sky: (seed: number): Brush => ({
    seed,
    flow: -0.04,
    jitter: 0.04,
    bristle: 0.35,
    layers: [
      { size: 30, length: 3.6, alpha: 0.55 },
      { size: 13, length: 3.2, alpha: 0.6, detail: 0.05 },
    ],
  }),
  /** Land far off: broad strokes, a little detail at the ridges. */
  far: (seed: number): Brush => ({
    seed,
    flow: -0.12,
    jitter: 0.06,
    layers: [
      { size: 20, length: 3, alpha: 0.7 },
      { size: 8, alpha: 0.75, detail: 0.1 },
      { size: 3.5, alpha: 0.8, detail: 0.3 },
    ],
  }),
  /** The ground the eye rests on: visible strokes, edges cut fine, hatching in the deep shade. */
  near: (seed: number, shade: Hex): Brush => ({
    seed,
    flow: -0.5,
    jitter: 0.09,
    bristle: 0.6,
    layers: [
      { size: 18, alpha: 0.8 },
      { size: 7, alpha: 0.85, detail: 0.08 },
      { size: 3, alpha: 0.9, detail: 0.28 },
    ],
    hatch: { color: shade, angle: -1.0, spacing: 7, below: 0.12, alpha: 0.22 },
  }),
  /** A figure the camera comes close to: small strokes that keep its drawing. */
  figure: (seed: number, shade: Hex): Brush => ({
    seed,
    flow: 1.2,
    jitter: 0.07,
    bristle: 0.55,
    layers: [
      { size: 9, alpha: 0.8 },
      { size: 4.5, alpha: 0.85, detail: 0.08 },
      { size: 2, alpha: 0.9, detail: 0.3 },
    ],
    hatch: { color: shade, angle: -0.9, spacing: 5, below: 0.13, alpha: 0.2, width: 0.9 },
  }),
};

/** `hex` at `alpha`, as a canvas colour. */
export const tint = (hex: Hex, alpha: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/** The height of a line through `points` (x ascending) at `x`, straight between them. */
export const along = (points: ReadonlyArray<readonly [number, number]>, x: number): number => {
  const first = points[0];
  if (first === undefined) return 0;
  let prev = first;
  for (const p of points) {
    if (p[0] >= x) {
      if (p[0] === prev[0]) return p[1];
      const k = (x - prev[0]) / (p[0] - prev[0]);
      return prev[1] + (p[1] - prev[1]) * k;
    }
    prev = p;
  }
  return prev[1];
};

/** A ridge's roughness at `x`: a few seeded sines, ± `amp` px. */
export const rough = (x: number, seed: number, amp: number) =>
  amp *
  (0.55 * Math.sin(x * 0.011 + seed) +
    0.3 * Math.sin(x * 0.029 + seed * 1.7) +
    0.15 * Math.sin(x * 0.071 + seed * 2.9));

/** A tuft of grass blades rising from (`x`, `y`): thin bent wedges, `n` of them, up to `h` tall. */
export const tuft = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  n: number,
  r: () => number,
  color: Hex,
  tip: Hex,
) => {
  for (let i = 0; i < n; i++) {
    const bx = x + (r() - 0.5) * h * 0.6;
    const len = h * (0.45 + 0.55 * r());
    const lean = (r() - 0.5) * 0.9;
    const w = 2 + r() * 4;
    const tx = bx + Math.sin(lean) * len;
    const ty = y - Math.cos(lean) * len;
    const g = ctx.createLinearGradient(bx, y, tx, ty);
    g.addColorStop(0, color);
    g.addColorStop(0.75, color);
    g.addColorStop(1, tip);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(bx - w, y);
    ctx.quadraticCurveTo(bx + Math.sin(lean) * len * 0.4, y - len * 0.5, tx, ty);
    ctx.quadraticCurveTo(bx + Math.sin(lean) * len * 0.5 + w * 0.3, y - len * 0.45, bx + w, y);
    ctx.closePath();
    ctx.fill();
  }
};
