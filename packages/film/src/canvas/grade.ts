// The painted finish over a whole frame, after the scene and its light:
// bloom (the brightest light spilling soft into the air about it) and a
// grade (contrast, saturation and a split tone: one colour into the
// shadows, another into the highlights). Both read the frame's own pixels
// and nothing else, so a frame is graded alike however it was reached.

import { Schema } from 'effect';
import { offscreen, type Offscreen } from './paper.ts';

/** An amount the canvas draws: 0..1. */
const Unit = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }));
/** A colour as `#rrggbb`. */
const Rgb = Schema.String.check(Schema.isPattern(/^#[0-9a-fA-F]{6}$/));

/** The brightest light spilling into the air about it. */
export const BloomStyle = Schema.Struct({
  /** How strongly the spill is added over the frame, 0..1. */
  amount: Unit,
  /** How far it spreads, in frame px. */
  radius: Schema.Finite.check(Schema.isGreaterThan(0)),
  /** The value, 0..1, above which a pixel spills. */
  threshold: Unit,
});
export type BloomStyle = typeof BloomStyle.Type;

/** A grade: contrast, saturation and a split tone. */
export const GradeStyle = Schema.Struct({
  /** The colour pushed into the shadows (`#rrggbb`); its hue, at `split`. */
  shadows: Rgb,
  /** The colour pushed into the highlights (`#rrggbb`); its hue, at `split`. */
  highlights: Rgb,
  /** How strongly the split tone takes, 0..1. */
  split: Unit,
  /** An S curve's strength, 0 (none) to 1. */
  contrast: Unit,
  /** 1 leaves the colour alone; under it greys, over it saturates. */
  saturation: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 2 })),
});
export type GradeStyle = typeof GradeStyle.Type;

/** A frame's bloom, a quarter of its size each way. */
const SHRINK = 4;

/** The small canvases a bloom is worked on: the bright pass and its blur. */
export interface BloomSheets {
  readonly bright: Offscreen;
  readonly soft: Offscreen;
}

export const makeBloom = (w: number, h: number): BloomSheets => ({
  bright: offscreen(Math.ceil(w / SHRINK), Math.ceil(h / SHRINK)),
  soft: offscreen(Math.ceil(w / SHRINK), Math.ceil(h / SHRINK)),
});

/**
 * Add the frame's bloom over it: the frame shrunk, each pixel kept only by
 * how far its value stands over the threshold (its colour kept), blurred by
 * the radius and added back, `lighter`, at the amount.
 */
export const bloom = (
  ctx: CanvasRenderingContext2D,
  sheets: BloomSheets,
  style: BloomStyle,
  w: number,
  h: number,
) => {
  if (style.amount <= 0) return;
  const { bright, soft } = sheets;
  const bw = bright.c.width;
  const bh = bright.c.height;
  bright.ctx.globalCompositeOperation = 'copy';
  bright.ctx.drawImage(ctx.canvas, 0, 0, w, h, 0, 0, bw, bh);
  const img = bright.ctx.getImageData(0, 0, bw, bh);
  const d = img.data;
  const knee = Math.max(1e-3, 1 - style.threshold);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] ?? 0;
    const g = d[i + 1] ?? 0;
    const b = d[i + 2] ?? 0;
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const k = Math.max(0, l - style.threshold) / knee;
    d[i] = r * k;
    d[i + 1] = g * k;
    d[i + 2] = b * k;
    d[i + 3] = 255;
  }
  bright.ctx.putImageData(img, 0, 0);
  soft.ctx.globalCompositeOperation = 'copy';
  soft.ctx.filter = `blur(${(style.radius / SHRINK).toFixed(2)}px)`;
  soft.ctx.drawImage(bright.c, 0, 0);
  soft.ctx.filter = 'none';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = style.amount;
  ctx.globalCompositeOperation = 'lighter';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(soft.c, 0, 0, bw, bh, 0, 0, w, h);
  ctx.restore();
};

/** A grade as tables: the curve per channel value, and the split tone's push per value. */
interface GradeTables {
  readonly curve: Uint8ClampedArray;
  readonly push: Float32Array;
  readonly saturation: number;
}

const channels = (hex: string): readonly [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

/**
 * The grade's tables, built once: `curve[v]`, the S curve over a channel's
 * value; `push[3·l + c]`, what channel `c` gains at value `l` (0..255): the
 * shadows' hue weighted by (1 − l)², the highlights' by l², each as its
 * difference from its own grey, so the split tone shifts hue and leaves the
 * value alone.
 */
export const gradeTables = (style: GradeStyle): GradeTables => {
  const curve = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const x = v / 255;
    // Smoothstep blended in by the contrast: an S that holds black and white.
    const s = x * x * (3 - 2 * x);
    curve[v] = Math.round(255 * (x + (s - x) * style.contrast));
  }
  const hue = (hex: string) => {
    const [r, g, b] = channels(hex);
    const grey = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return [r - grey, g - grey, b - grey] as const;
  };
  const low = hue(style.shadows);
  const high = hue(style.highlights);
  const push = new Float32Array(256 * 3);
  for (let l = 0; l < 256; l++) {
    const x = l / 255;
    const ws = (1 - x) ** 2 * style.split;
    const wh = x * x * style.split;
    for (let c = 0; c < 3; c++) push[l * 3 + c] = ws * (low[c] ?? 0) + wh * (high[c] ?? 0);
  }
  return { curve, push, saturation: style.saturation };
};

/** Grade every pixel of the `w` × `h` frame by its tables. */
export const grade = (ctx: CanvasRenderingContext2D, t: GradeTables, w: number, h: number) => {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const { curve, push, saturation } = t;
  for (let i = 0; i < d.length; i += 4) {
    const cr = curve[d[i] ?? 0] ?? 0;
    const cg = curve[d[i + 1] ?? 0] ?? 0;
    const cb = curve[d[i + 2] ?? 0] ?? 0;
    const l = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
    const li = (l | 0) * 3;
    d[i] = l + (cr - l) * saturation + (push[li] ?? 0);
    d[i + 1] = l + (cg - l) * saturation + (push[li + 1] ?? 0);
    d[i + 2] = l + (cb - l) * saturation + (push[li + 2] ?? 0);
  }
  ctx.putImageData(img, 0, 0);
};
