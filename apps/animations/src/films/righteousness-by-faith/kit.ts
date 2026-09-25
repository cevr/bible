// The film's recurring props and type treatments. Scenes compose these so the
// world stays one world: the same sun, the same tablets, the same tags.

import { at, cutout } from '../../engine/cutout.ts';
import type { Frame } from '../../engine/film.ts';
import {
  type Hand,
  type Pt,
  ellipseShape,
  line,
  quad,
  rectShape,
  spline,
  stroke,
} from '../../engine/ink.ts';
import { hash2 } from '../../engine/random.ts';
import { clamp, ease, envelope, progress } from '../../engine/time.ts';
import { type TextStyle, block, measure, write } from '../../engine/type.ts';
import { fonts, palette } from './palette.ts';

export const C = palette;
export const F = fonts;

// ─── type ────────────────────────────────────────────────────────────────────

export const hand = (size: number, color: string = C.ink, weight = 700): TextStyle => ({
  family: F.hand,
  size,
  weight,
  color,
});
export const serif = (
  size: number,
  color: string = C.ink,
  weight = 500,
  italic = false,
): TextStyle => ({ family: F.display, size, weight, color, italic });

/**
 * A quotation that reveals in step with the narration between two marks, and
 * leaves when `until` passes.
 */
export const quote = (
  f: Frame,
  text: string,
  x: number,
  y: number,
  width: number,
  opts: {
    from: string;
    to?: string;
    until?: number;
    size?: number;
    color?: string;
    align?: 'left' | 'center';
    italic?: boolean;
  },
) => {
  const size = opts.size ?? 54;
  const p = f.spoken(opts.from, opts.to);
  const out = opts.until === undefined ? 1 : 1 - progress(f.t, opts.until, 0.6);
  if (p <= 0 || out <= 0) return;
  f.ctx.save();
  f.ctx.globalAlpha *= out;
  const style: TextStyle = {
    ...serif(size, opts.color ?? C.ink, 500, opts.italic ?? true),
    leading: 1.28,
    align: opts.align ?? 'left',
  };
  block(f.ctx, text, x, y, width, style, f.hand(`q:${text.slice(0, 12)}`), {
    progress: p,
    reveal: 'rise',
    boil: 0.4,
  });
  f.ctx.restore();
};

/** A torn paper tag naming the source, pinned top-left while a quote plays. */
export const cite = (f: Frame, text: string, start: number, end: number, slot = 0) => {
  const a = envelope(f.t, start, end, 0.45, 0.45, ease.outCubic);
  if (a <= 0) return;
  const { ctx } = f;
  const style = hand(34, C.ink);
  const w = measure(ctx, text, style) + 48;
  const x = 70;
  const y = 64 + slot * 70;
  const slide = (1 - a) * -40;
  ctx.save();
  ctx.globalAlpha *= clamp(a * 1.4);
  at(ctx, { x: x + slide, y, rot: -0.015 + hash2(slot, 3) * 0.02 }, () => {
    cutout(
      ctx,
      rectShape(0, 0, w, 54),
      { color: C.robe, torn: 2.5, rim: 0, shadow: 0.5, grain: 0.3 },
      f.hand(`cite${slot}`),
    );
    cutout(
      ctx,
      rectShape(-10, 12, 18, 30),
      { color: C.gold, torn: 1.5, rim: 0, shadow: 0.3 },
      f.hand(`cite-tab${slot}`),
    );
    write(ctx, text, 26, 38, style, f.hand(`cite-text${slot}`), { boil: 0.3 });
  });
  ctx.restore();
};

/** BibleProject-style word study: the word, its original, and what it means. */
export const wordCard = (
  f: Frame,
  x: number,
  y: number,
  word: string,
  opts: {
    start: number;
    original?: string;
    lang?: string;
    gloss?: string;
    glossAt?: number;
    until?: number;
  },
) => {
  const { ctx } = f;
  const inP = progress(f.t, opts.start, 0.5, ease.outBack);
  const out = opts.until === undefined ? 0 : progress(f.t, opts.until, 0.5);
  if (inP <= 0 || out >= 1) return;
  ctx.save();
  ctx.globalAlpha *= 1 - out;
  const big: TextStyle = {
    family: F.display,
    size: 118,
    weight: 700,
    color: C.ink,
    align: 'center',
    tracking: 0.12,
  };
  write(ctx, word, x, y, big, f.hand(`w:${word}`), {
    progress: progress(f.t, opts.start, 0.9, ease.linear),
    reveal: 'pop',
  });
  if (opts.original !== undefined) {
    const oP = progress(f.t, opts.start + 0.6, 0.8, ease.linear);
    write(
      ctx,
      `${opts.lang ?? ''}  ${opts.original}`.trim(),
      x,
      y + 90,
      { family: F.greek, size: 58, weight: 400, color: C.red, align: 'center' },
      f.hand(`o:${word}`),
      { progress: oP, reveal: 'write' },
    );
  }
  if (opts.gloss !== undefined) {
    const gy = y + (opts.original === undefined ? 110 : 180);
    const gP = progress(f.t, opts.glossAt ?? opts.start + 1, 1, ease.linear);
    const style = { ...hand(72, C.orange), align: 'center' as const };
    // A marker swash behind the gloss.
    const gw = measure(ctx, opts.gloss, style);
    stroke(
      ctx,
      line([x - gw / 2 - 20, gy - 20], [x + gw / 2 + 20, gy - 16], 0.02, 5),
      { color: C.glow, width: 64, progress: gP, alpha: 0.9, taper: 0.05 },
      f.hand(`sw:${word}`),
    );
    write(ctx, opts.gloss, x, gy, style, f.hand(`g:${word}`), { progress: gP, reveal: 'write' });
  }
  ctx.restore();
};

// ─── props ───────────────────────────────────────────────────────────────────

/** The torn gold sun: a disc, a ring of rounded paper rays, and a halo. */
export const sun = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  grow: number,
  h: Hand,
  spin = 0,
) => {
  if (grow <= 0) return;
  const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 3.2);
  g.addColorStop(0, 'rgba(251, 239, 200, 0.85)');
  g.addColorStop(1, 'rgba(251, 239, 200, 0)');
  ctx.save();
  ctx.globalAlpha *= clamp(grow);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 3.2 * grow, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const rays = 14;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + spin;
    const local = clamp(grow * 1.6 - (i / rays) * 0.6);
    if (local <= 0) continue;
    const len = r * (0.75 + 0.2 * hash2(i, h.seed)) * ease.outBack(local);
    const w = r * 0.2;
    const r0 = r * 1.08;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const petal: Pt[] = spline(
      [
        [x + ca * r0 - sa * w * 0.5, y + sa * r0 + ca * w * 0.5],
        [x + ca * (r0 + len) - sa * w * 0.35, y + sa * (r0 + len) + ca * w * 0.35],
        [x + ca * (r0 + len + w * 0.4), y + sa * (r0 + len + w * 0.4)],
        [x + ca * (r0 + len) + sa * w * 0.35, y + sa * (r0 + len) - ca * w * 0.35],
        [x + ca * r0 + sa * w * 0.5, y + sa * r0 - ca * w * 0.5],
      ],
      6,
      true,
    );
    cutout(
      ctx,
      petal,
      { color: i % 2 === 0 ? C.gold : C.orange, torn: 1.8, rim: 2, shadow: 0.35 },
      { boil: h.boil, seed: h.seed + i },
    );
  }
  const d = r * ease.outBack(clamp(grow * 1.3));
  cutout(ctx, ellipseShape(x, y, d, d), { color: C.orange, torn: 3, rim: 3, shadow: 0.5 }, h);
  cutout(
    ctx,
    ellipseShape(x - d * 0.08, y - d * 0.08, d * 0.72, d * 0.72),
    { color: C.gold, torn: 2.5, rim: 0, shadow: 0 },
    { boil: h.boil, seed: h.seed + 99 },
  );
};

/** One stone tablet (rounded top), centred on x, bottom at y. */
const tabletShape = (x: number, y: number, w: number, h: number): Pt[] => {
  const r = w / 2;
  const pts: Pt[] = [[x - r, y]];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI + (Math.PI * i) / 16;
    pts.push([x + Math.cos(a) * r, y - h + r + Math.sin(a) * r]);
  }
  pts.push([x + r, y]);
  return pts;
};

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** The two tablets of the law, standing on a baseline centred at (x, y). */
export const tablets = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  h: Hand,
  opts: { glow?: number; color?: string; write?: number } = {},
) => {
  const w = 190 * s;
  const ht = 300 * s;
  const gap = 14 * s;
  const glow = opts.glow ?? 0;
  if (glow > 0) {
    const g = ctx.createRadialGradient(x, y - ht / 2, 10, x, y - ht / 2, ht * 1.3);
    g.addColorStop(0, `rgba(230, 179, 71, ${0.55 * glow})`);
    g.addColorStop(1, 'rgba(230, 179, 71, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - ht * 1.4, y - ht * 2, ht * 2.8, ht * 2.4);
  }
  const stone = opts.color ?? '#b9b09c';
  const written = opts.write ?? 1;
  [-1, 1].forEach((side, k) => {
    const cx = x + side * (w / 2 + gap / 2);
    cutout(
      ctx,
      tabletShape(cx, y, w, ht),
      { color: stone, torn: 3, rim: 3, shadow: 0.7, grain: 0.9 },
      { boil: h.boil, seed: h.seed + k },
    );
    for (let i = 0; i < 5; i++) {
      const n = k * 5 + i;
      const local = clamp(written * 10 - n);
      if (local <= 0) continue;
      const ly = y - ht + w / 2 + 24 * s + i * 40 * s;
      write(
        ctx,
        NUMERALS[n] ?? '',
        cx - w / 2 + 34 * s,
        ly + 10 * s,
        { family: F.display, size: 26 * s, weight: 700, color: C.inkSoft, align: 'center' },
        { boil: h.boil, seed: h.seed + 40 + n },
        { boil: 0.2 },
      );
      stroke(
        ctx,
        line([cx - w / 2 + 74 * s, ly], [cx + w / 2 - 22 * s, ly], 0.03, h.seed + n),
        { color: C.inkSoft, width: 5 * s, progress: local, alpha: 0.7 },
        { boil: h.boil, seed: h.seed + 60 + n },
      );
    }
  });
};

/** An open book, centred at (x, y), `s` = scale. */
export const book = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number, h: Hand) => {
  at(ctx, { x, y, scale: s }, () => {
    const cover: Pt[] = [
      [-230, -120],
      [0, -100],
      [230, -120],
      [240, 120],
      [0, 140],
      [-240, 120],
    ];
    cutout(
      ctx,
      cover,
      { color: C.clay, torn: 2, rim: 0, shadow: 0.7 },
      { boil: h.boil, seed: h.seed },
    );
    const left: Pt[] = [
      [-214, -128],
      [-8, -108],
      [-8, 124],
      [-222, 106],
    ];
    const right: Pt[] = [
      [8, -108],
      [214, -128],
      [222, 106],
      [8, 124],
    ];
    cutout(
      ctx,
      left,
      { color: C.robe, torn: 1.5, rim: 0, shadow: 0.3, grain: 0.3 },
      { boil: h.boil, seed: h.seed + 1 },
    );
    cutout(
      ctx,
      right,
      { color: C.robe, torn: 1.5, rim: 0, shadow: 0.3, grain: 0.3 },
      { boil: h.boil, seed: h.seed + 2 },
    );
    for (let i = 0; i < 7; i++) {
      for (const side of [-1, 1]) {
        const y0 = -80 + i * 28;
        const x0 = side < 0 ? -190 : 32;
        const len = 150 - hash2(i, side + 5) * 40;
        stroke(
          ctx,
          line([x0, y0 + (side < 0 ? 2 : -2)], [x0 + len, y0], 0.02, i),
          { color: C.inkSoft, width: 3.2, alpha: 0.55 },
          { boil: h.boil, seed: h.seed + 10 + i * 2 + side },
        );
      }
    }
  });
};

/** A small planet: a disc with a band and sometimes a ring. */
export const planet = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  h: Hand,
  ring = false,
) => {
  if (ring)
    stroke(
      ctx,
      quad([x - r * 1.9, y + r * 0.3], [x, y + r * 0.9], [x + r * 1.9, y - r * 0.3]),
      { color: C.robe, width: r * 0.22 },
      h,
    );
  cutout(ctx, ellipseShape(x, y, r, r), { color, torn: 1.5, rim: 2, shadow: 0.4 }, h);
};

/** A four-point sparkle star. */
export const star = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha = 1,
) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
  ctx.restore();
};

/** A full-bleed sheet of coloured paper laid over the page (e.g. night). */
export const sheet = (
  ctx: CanvasRenderingContext2D,
  color: string,
  h: Hand,
  alpha = 1,
  inset = -40,
) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  cutout(
    ctx,
    rectShape(inset, inset, 1920 - inset * 2, 1080 - inset * 2),
    { color, torn: 5, rim: 0, shadow: 0, grain: 0.8 },
    h,
  );
  ctx.restore();
};

/** Faint rows of handwritten scribble — a notebook's worth of words. */
export const scribbles = (
  ctx: CanvasRenderingContext2D,
  color: string,
  alpha: number,
  h: Hand,
  top = 60,
  rows = 22,
) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  for (let r = 0; r < rows; r++) {
    const y = top + r * 46;
    let x = 40 + hash2(r, 1) * 40;
    while (x < 1880) {
      const w = 40 + hash2(r, Math.floor(x)) * 120;
      const pts: Pt[] = [];
      for (let k = 0; k <= w / 6; k++)
        pts.push([x + k * 6, y + Math.sin(k * 1.9 + r) * 5 * hash2(k, r)]);
      stroke(
        ctx,
        pts,
        { color, width: 2.2, jitter: 0.6, taper: 0.1 },
        { boil: h.boil, seed: h.seed + r * 97 + Math.floor(x) },
      );
      x += w + 22 + hash2(r, Math.floor(x) + 3) * 20;
    }
  }
  ctx.restore();
};
