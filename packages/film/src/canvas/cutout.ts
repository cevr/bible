// Cut paper. A cutout is a coloured sheet with a torn edge, a rim of the white
// paper core showing where it tore, pastel grain on its face, and a soft
// shadow where it lifts off the sheet beneath.

import { type Vec2, vec2 } from 'math';
import { type Hand, type Path, type Pt, resample } from './ink.ts';
import { offscreen } from './paper.ts';
import { probeOf, recordInk } from './probe.ts';
import { hash2, noise1, rng } from '../core/random.ts';

export interface CutoutStyle {
  color: string;
  /** Torn-edge roughness in px; 0 cuts clean like scissors. */
  torn?: number;
  /** Width of the white torn rim in px; 0 for none. */
  rim?: number;
  rimColor?: string;
  /** Shadow strength 0..1. */
  shadow?: number;
  /** Pastel grain strength 0..1. */
  grain?: number;
  alpha?: number;
}

const PAPER_CORE = '#fbf6ea';

const heights = new WeakMap<CanvasRenderingContext2D, number>();

/**
 * Draw with every cutout's shadow cast from `height` times its usual height
 * above the sheet beneath: a longer, softer, fainter shadow, as a layer
 * nearer the camera casts on the one behind it. Heights nest by multiplying.
 */
export const raised = (ctx: CanvasRenderingContext2D, height: number, draw: () => void) => {
  const before = heights.get(ctx);
  heights.set(ctx, (before ?? 1) * height);
  try {
    draw();
  } finally {
    if (before === undefined) heights.delete(ctx);
    else heights.set(ctx, before);
  }
};

/** Scratch for the outward normal at each point, written and read within one step. */
const normal: Vec2 = [0, 0];

/** Push a closed outline outward by `amount` plus torn noise. */
const tear = (shape: Path, amount: number, rough: number, seed: number, boil: number): Pt[] => {
  const closed = [...shape, shape[0] ?? [0, 0]];
  const pts = resample(closed, 3);
  const n = pts.length;
  if (n < 3) return pts;
  // Winding decides which normal points out.
  let area = 0;
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i] ?? [0, 0];
    const b = pts[i + 1] ?? [0, 0];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const out = area > 0 ? -1 : 1;
  const res: Pt[] = [];
  let s = 0;
  const jitterPhase = boil * 0.9;
  for (let i = 0; i < n; i++) {
    const p = pts[i] ?? [0, 0];
    const prev = pts[(i - 1 + n) % n] ?? p;
    const next = pts[(i + 1) % n] ?? p;
    if (i > 0) s += 3;
    normal[0] = next[1] - prev[1];
    normal[1] = -(next[0] - prev[0]);
    vec2.normalize(normal, normal);
    const nx = normal[0] * out;
    const ny = normal[1] * out;
    // Torn fibre: coarse wander + fine tooth, and a whisper of boil.
    const d =
      amount +
      rough * (0.65 * noise1(s * 0.035, seed) + 0.35 * (hash2(i, seed) * 2 - 1)) +
      0.4 * noise1(s * 0.05 + jitterPhase, seed + 5);
    res.push([p[0] + nx * d, p[1] + ny * d]);
  }
  return res;
};

const trace = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>) => {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
  ctx.closePath();
};

let pastel: HTMLCanvasElement | undefined;

/** Directional crayon streaks, light and dark, on a transparent tile. */
const pastelTile = (): HTMLCanvasElement => {
  if (pastel !== undefined) return pastel;
  const { c, ctx } = offscreen(320, 320);
  const r = rng(4242);
  ctx.lineCap = 'round';
  for (let i = 0; i < 2600; i++) {
    const x = r() * 320;
    const y = r() * 320;
    const len = 4 + r() * 16;
    const a = -0.5 + (r() - 0.5) * 0.35;
    ctx.strokeStyle = r() > 0.5 ? '#ffffff' : '#000000';
    ctx.globalAlpha = 0.05 + r() * 0.12;
    ctx.lineWidth = 0.6 + r() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  pastel = c;
  return c;
};

/** Draw a torn-paper cutout of `shape`. */
export const cutout = (
  ctx: CanvasRenderingContext2D,
  shape: Path,
  style: CutoutStyle,
  hand: Hand,
) => {
  if (shape.length < 3) return;
  const torn = style.torn ?? 4;
  const rim = style.rim ?? 3;
  const face = tear(shape, 0, torn, hand.seed, hand.boil);
  ctx.save();
  ctx.globalAlpha *= style.alpha ?? 1;

  // Rim (the white core where the sheet tore), carrying the shadow.
  const lift = style.shadow ?? 0.5;
  const under = rim > 0 ? tear(shape, rim, torn * 1.3, hand.seed + 17, hand.boil) : face;
  if (lift > 0) {
    const height = heights.get(ctx) ?? 1;
    ctx.save();
    ctx.shadowColor = `rgba(40, 28, 16, ${(0.28 * lift) / Math.sqrt(height)})`;
    ctx.shadowBlur = 10 * lift * height;
    ctx.shadowOffsetX = 2 * lift * height;
    ctx.shadowOffsetY = 5 * lift * height;
    ctx.fillStyle = rim > 0 ? (style.rimColor ?? PAPER_CORE) : style.color;
    trace(ctx, under);
    ctx.fill();
    ctx.restore();
  } else if (rim > 0) {
    ctx.fillStyle = style.rimColor ?? PAPER_CORE;
    trace(ctx, under);
    ctx.fill();
  }

  // Face.
  ctx.fillStyle = style.color;
  trace(ctx, face);
  ctx.fill();
  const probe = probeOf(ctx);
  if (probe !== undefined) recordInk(ctx, probe, 'fill', shape, 0, ctx.globalAlpha);

  const g = style.grain ?? 0.6;
  if (g > 0) {
    ctx.save();
    trace(ctx, face);
    ctx.clip();
    const pattern = ctx.createPattern(pastelTile(), 'repeat');
    if (pattern !== null) {
      pattern.setTransform(new DOMMatrix().translate(hand.seed % 320, (hand.seed >> 8) % 320));
      ctx.globalAlpha *= g;
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = pattern;
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
};

export interface Place {
  x: number;
  y: number;
  rot?: number;
  scale?: number;
  /** Non-uniform squash, for springy landings. */
  sx?: number;
  sy?: number;
}

/** Draw in a local frame placed at (x, y), rotated and scaled about it. */
export const at = (ctx: CanvasRenderingContext2D, p: Place, draw: () => void) => {
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.rot !== undefined) ctx.rotate(p.rot);
  const s = p.scale ?? 1;
  ctx.scale(s * (p.sx ?? 1), s * (p.sy ?? 1));
  draw();
  ctx.restore();
};
