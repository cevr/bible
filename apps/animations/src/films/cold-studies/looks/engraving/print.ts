// The print the engraving is pulled on: warm cream rag paper with its fibre
// and mottle, the plate's impression pressed into it, and the ruled border
// round the picture. Made once for each size from a fixed seed and kept, so
// every frame lays the same sheet.

import { type Hex, mix } from '@bible/film/canvas';
import { rng } from '@bible/film/core';

/** The paper and the inks. */
export const INK: Hex = '#1b1612';
export const PAPER: Hex = '#efe4ca';
export const PAPER_DEEP: Hex = '#e2d3b2';
/** The gold of the Word: a hand-laid wash, and its ink for type. */
export const GOLD_WASH: Hex = '#e3b04b';
export const GOLD_INK: Hex = '#a8741a';

/** The picture on the sheet: the plate's printed area, frame px. */
export const PICTURE = { x: 70, y: 52, w: 1780, h: 976 } as const;

const sheets = new Map<string, HTMLCanvasElement>();

/** The paper alone at `w` × `h` px: cream, mottled, with fibres and a few foxing spots. */
export const paper = (w: number, h: number, seed: number): HTMLCanvasElement => {
  const key = `${w}x${h}:${seed}`;
  const have = sheets.get(key);
  if (have !== undefined) return have;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx === null) return c;
  const r = rng(seed);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  const k = w / 1920;
  // As many marks for each part of the sheet, whatever its size.
  const area = (w * h) / (1920 * 1080);
  // Mottle: broad soft clouds a shade deeper and a shade paler.
  for (let i = 0; i < 70 * area; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = (80 + r() * 260) * k;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const deep = r() < 0.6;
    g.addColorStop(0, deep ? 'rgba(150,120,80,0.032)' : 'rgba(255,250,235,0.06)');
    g.addColorStop(1, 'rgba(150,120,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Fibres: short hairlines lying every way.
  for (let i = 0; i < 2600 * area; i++) {
    const x = r() * w;
    const y = r() * h;
    const len = (3 + r() * 14) * k;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r() * Math.PI);
    ctx.fillStyle = r() < 0.5 ? 'rgba(120,95,60,0.10)' : 'rgba(255,252,240,0.18)';
    ctx.fillRect(-len / 2, 0, len, Math.max(0.6, 0.9 * k));
    ctx.restore();
  }
  // Foxing: a few small rust spots.
  for (let i = 0; i < 14 * area; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = (1.5 + r() * 5) * k;
    ctx.fillStyle = `rgba(150,96,50,${(0.05 + r() * 0.08).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rad, rad * (0.7 + r() * 0.5), r() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  sheets.set(key, c);
  return c;
};

/** Lay the paper over the whole frame (`w` × `h` in frame units), at the context's own resolution. */
export const layPaper = (ctx: CanvasRenderingContext2D, w: number, h: number, seed = 7) => {
  const m = ctx.getTransform();
  const s = Math.hypot(m.a, m.b) || 1;
  const sheet = paper(Math.round(w * s), Math.round(h * s), seed);
  ctx.drawImage(sheet, 0, 0, w, h);
};

/** A ruled line as a thin filled bar (`x0, y0` to `x1, y1`, axis-aligned), `t` thick. */
const rule = (
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  t: number,
) => {
  ctx.fillRect(
    Math.min(x0, x1) - t / 2,
    Math.min(y0, y1) - t / 2,
    Math.abs(x1 - x0) + t,
    Math.abs(y1 - y0) + t,
  );
};

/** A box's four ruled sides. */
export const ruledBox = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
) => {
  rule(ctx, x, y, x + w, y, t);
  rule(ctx, x, y + h, x + w, y + h, t);
  rule(ctx, x, y, x, y + h, t);
  rule(ctx, x + w, y, x + w, y + h, t);
};

/**
 * The plate's impression round `box`: the paper inside pressed a shade
 * deeper and smoother, its edge a bevel (a shadow on two sides, a light on
 * the others), and the picture's border ruled in ink, a heavy line within a
 * hairline.
 */
export const plate = (
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
) => {
  const pad = 26;
  const px = box.x - pad;
  const py = box.y - pad;
  const pw = box.w + pad * 2;
  const ph = box.h + pad * 2;
  ctx.save();
  ctx.fillStyle = 'rgba(120,96,60,0.06)';
  ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = 'rgba(90,70,40,0.16)';
  rule(ctx, px, py, px + pw, py, 2);
  rule(ctx, px, py, px, py + ph, 2);
  ctx.fillStyle = 'rgba(255,252,240,0.6)';
  rule(ctx, px, py + ph, px + pw, py + ph, 2);
  rule(ctx, px + pw, py, px + pw, py + ph, 2);
  ctx.fillStyle = mix(INK, PAPER, 0.08);
  ruledBox(ctx, box.x, box.y, box.w, box.h, 3);
  ctx.fillStyle = mix(INK, PAPER, 0.25);
  ruledBox(ctx, box.x - 9, box.y - 9, box.w + 18, box.h + 18, 1);
  ctx.restore();
};
