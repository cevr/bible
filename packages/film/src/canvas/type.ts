// Lettering. Text arrives glyph by glyph — written on like a pen, or popped in
// like cut-out letters — and every glyph boils a little so type sits in the
// same hand-made world as the drawings.

import type { Hand } from './ink.ts';
import { hash2, noise1 } from '../core/random.ts';
import { clamp, ease } from '../core/time.ts';

export interface TextStyle {
  family: string;
  size: number;
  weight?: number;
  italic?: boolean;
  color: string;
  align?: 'left' | 'center' | 'right';
  /** Extra space between letters, in em. */
  tracking?: number;
  /** Line height as a multiple of size. */
  leading?: number;
}

export const font = (s: TextStyle) =>
  `${s.italic === true ? 'italic ' : ''}${s.weight ?? 400} ${s.size}px "${s.family}"`;

export type Reveal =
  /** A pen writes each glyph left to right. */
  | 'write'
  /** Glyphs rise and fade in. */
  | 'rise'
  /** Glyphs pop in with a small overshoot, like pasted letters. */
  | 'pop';

export interface WriteOptions {
  /** 0→1 across the whole text. */
  progress?: number;
  reveal?: Reveal;
  /** Per-glyph boil in px; 0 holds type still. */
  boil?: number;
  alpha?: number;
}

const glyphs = (ctx: CanvasRenderingContext2D, text: string, style: TextStyle) => {
  ctx.font = font(style);
  const track = (style.tracking ?? 0) * style.size;
  // Grapheme clusters, so combining marks (Greek accents, Hebrew points) stay on their letter.
  const chars = Array.from(graphemes.segment(text), (g) => g.segment);
  const xs: number[] = [];
  const ws: number[] = [];
  let x = 0;
  let prefix = '';
  for (const ch of chars) {
    xs.push(x);
    const before = ctx.measureText(prefix).width;
    prefix += ch;
    // Advance by the kerned prefix, not the lone glyph.
    const w = ctx.measureText(prefix).width - before;
    ws.push(w);
    x += w + track;
  }
  return { chars, xs, ws, width: Math.max(0, x - track) };
};

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Hebrew, Arabic and friends: shaped and ordered by the browser, never glyph by glyph. */
const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

export const measure = (ctx: CanvasRenderingContext2D, text: string, style: TextStyle) =>
  glyphs(ctx, text, style).width;

/** One line of text at (x, y) — y is the alphabetic baseline. */
export const write = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  style: TextStyle,
  hand: Hand,
  opts: WriteOptions = {},
) => {
  if (RTL.test(text)) return writeWhole(ctx, text, x, y, style, hand, opts);
  const { chars, xs, ws, width } = glyphs(ctx, text, style);
  const align = style.align ?? 'left';
  const x0 = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  const progress = clamp(opts.progress ?? 1);
  const reveal = opts.reveal ?? 'rise';
  const n = chars.length;
  const boil = opts.boil ?? 0.6;
  ctx.save();
  ctx.font = font(style);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = style.color;
  const baseAlpha = ctx.globalAlpha * (opts.alpha ?? 1);
  // Each glyph's own 0→1, overlapping its neighbours.
  const spread = reveal === 'write' ? 1 : 3;
  for (let i = 0; i < n; i++) {
    const ch = chars[i] ?? '';
    if (ch === ' ') continue;
    const local = clamp(progress * (n + spread) - i, 0, spread) / spread;
    if (local <= 0) continue;
    const gx = x0 + (xs[i] ?? 0);
    const gw = ws[i] ?? 0;
    const jx = boil * noise1(hand.boil * 1.3 + i * 7.1, hand.seed);
    const jy = boil * noise1(hand.boil * 1.7 + i * 3.3, hand.seed + 1);
    const rot = boil * 0.006 * noise1(hand.boil + i * 5.3, hand.seed + 2);
    ctx.save();
    ctx.translate(gx + gw / 2 + jx, y + jy);
    ctx.rotate(rot + (reveal === 'pop' ? (hash2(i, hand.seed) - 0.5) * 0.12 * (1 - local) : 0));
    if (reveal === 'write') {
      ctx.globalAlpha = baseAlpha;
      ctx.beginPath();
      ctx.rect(-gw / 2 - 4, -style.size * 1.2, (gw + 8) * local, style.size * 1.6);
      ctx.clip();
    } else if (reveal === 'rise') {
      const e = ease.outCubic(local);
      ctx.globalAlpha = baseAlpha * e;
      ctx.translate(0, (1 - e) * style.size * 0.25);
    } else {
      const e = ease.outBack(local);
      ctx.globalAlpha = baseAlpha * clamp(local * 3);
      ctx.scale(e, e);
    }
    ctx.fillText(ch, -gw / 2, 0);
    ctx.restore();
  }
  ctx.restore();
  return width;
};

/** Break text into lines no wider than `maxWidth`. */
export const wrap = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  style: TextStyle,
): string[] => {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let cur = '';
    for (const word of para.split(/\s+/)) {
      const next = cur.length === 0 ? word : `${cur} ${word}`;
      if (cur.length > 0 && measure(ctx, next, style) > maxWidth) {
        lines.push(cur);
        cur = word;
      } else cur = next;
    }
    lines.push(cur);
  }
  return lines;
};

/**
 * A wrapped block. Progress runs across all lines in reading order.
 * Returns the block height.
 */
export const block = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  style: TextStyle,
  hand: Hand,
  opts: WriteOptions = {},
) => {
  const lines = wrap(ctx, text, maxWidth, style);
  const lead = (style.leading ?? 1.25) * style.size;
  const total = lines.reduce((n, l) => n + l.length, 0) || 1;
  const progress = clamp(opts.progress ?? 1);
  let done = 0;
  lines.forEach((l, i) => {
    const start = done / total;
    const span = l.length / total;
    done += l.length;
    const p = span === 0 ? 1 : clamp((progress - start) / span);
    if (p > 0)
      write(
        ctx,
        l,
        x,
        y + i * lead,
        style,
        { boil: hand.boil, seed: hand.seed + i * 101 },
        { ...opts, progress: p },
      );
  });
  return lines.length * lead;
};

/**
 * Right-to-left text drawn as one shaped string. It is revealed by a wipe from
 * the right edge, the way the script is written.
 */
const writeWhole = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  style: TextStyle,
  hand: Hand,
  opts: WriteOptions,
) => {
  ctx.save();
  ctx.font = font(style);
  ctx.direction = 'rtl';
  ctx.textBaseline = 'alphabetic';
  const width = ctx.measureText(text).width;
  const align = style.align ?? 'left';
  // x is the line's left edge for 'left', its centre for 'center', its right edge for 'right'.
  const right = align === 'center' ? x + width / 2 : align === 'right' ? x : x + width;
  const p = clamp(opts.progress ?? 1);
  const b = opts.boil ?? 0.6;
  ctx.globalAlpha *= opts.alpha ?? 1;
  ctx.beginPath();
  ctx.rect(right - (width + 20) * p, y - style.size * 1.3, (width + 20) * p + 10, style.size * 1.8);
  ctx.clip();
  ctx.fillStyle = style.color;
  ctx.textAlign = 'right';
  ctx.fillText(
    text,
    right + b * noise1(hand.boil * 1.3, hand.seed),
    y + b * noise1(hand.boil * 1.7, hand.seed + 1),
  );
  ctx.restore();
  return width;
};
