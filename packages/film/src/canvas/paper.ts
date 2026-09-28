// The paper under everything, and the grain over everything. Both are built
// once from a seed; grain cycles through a few tiles on the boil tick, each
// shifted by the tick, so the surface feels alive without flickering at the
// full frame rate. A frame's grain is a function of its tick alone.

import type { Vec2 } from 'math';
import { fbm, hash2, rng } from '../core/random.ts';

export interface PaperStyle {
  base: string;
  /** Colour of the fibres and mottling. */
  tone: string;
  seed: number;
}

/** A canvas off the page and its 2D context. */
export interface Offscreen {
  readonly c: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
}

/** A `w` × `h` canvas off the page, for a tile, a sheet or a transition's layer. */
export const offscreen = (w: number, h: number): Offscreen => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx === null) throw new Error('2d context unavailable');
  return { c, ctx };
};

/** A full-frame sheet: base colour, soft mottling, fibres, and flecks. */
export const makePaper = (w: number, h: number, style: PaperStyle): HTMLCanvasElement => {
  const { c, ctx } = offscreen(w, h);
  ctx.fillStyle = style.base;
  ctx.fillRect(0, 0, w, h);

  // Mottling: low-resolution fractal noise, upscaled smoothly.
  const lw = Math.ceil(w / 8);
  const lh = Math.ceil(h / 8);
  const low = offscreen(lw, lh);
  const img = low.ctx.createImageData(lw, lh);
  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) {
      const n = fbm(x / 28, y / 28, style.seed, 5);
      const i = (y * lw + x) * 4;
      const v = n > 0 ? 255 : 0;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = Math.min(255, Math.abs(n) * 60);
    }
  }
  low.ctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalCompositeOperation = 'soft-light';
  ctx.drawImage(low.c, 0, 0, w, h);
  ctx.restore();

  // Fibres: short, faint, gently curved hairs.
  const r = rng(style.seed + 1);
  ctx.save();
  ctx.strokeStyle = style.tone;
  ctx.lineCap = 'round';
  const fibres = Math.round((w * h) / 2600);
  for (let i = 0; i < fibres; i++) {
    const x = r() * w;
    const y = r() * h;
    const len = 6 + r() * 22;
    const a = r() * Math.PI * 2;
    const bend = (r() - 0.5) * 0.8;
    ctx.globalAlpha = 0.03 + r() * 0.06;
    ctx.lineWidth = 0.5 + r() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(a + bend) * len * 0.5,
      y + Math.sin(a + bend) * len * 0.5,
      x + Math.cos(a) * len,
      y + Math.sin(a) * len,
    );
    ctx.stroke();
  }
  // Flecks: tiny dark and light specks.
  const flecks = Math.round((w * h) / 9000);
  for (let i = 0; i < flecks; i++) {
    ctx.globalAlpha = 0.05 + r() * 0.12;
    ctx.fillStyle = r() > 0.35 ? style.tone : '#ffffff';
    const s = 0.6 + r() * 1.6;
    ctx.fillRect(r() * w, r() * h, s, s);
  }
  ctx.restore();
  return c;
};

/**
 * Film grain for a `w` × `h` frame: tileable-enough noise tiles, each already
 * repeated across the frame plus one tile each way (a sheet), so a tick's
 * shifted grain is a plain copy out of its sheet rather than a pattern fill.
 */
export interface Grain {
  /** A tile's side in px: the tick's shift wraps at it. */
  readonly size: number;
  /** One sheet per tile, `w + size` × `h + size`; the film cycles them on the boil tick. */
  readonly sheets: ReadonlyArray<HTMLCanvasElement>;
}

/** One noise tile, `size` × `size`, opaque grey. */
const grainTile = (size: number, seed: number): HTMLCanvasElement => {
  const { c, ctx } = offscreen(size, size);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = hash2(i, seed) * 255;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
};

/** `count` grain tiles of `size` px, each laid out as a sheet over a `w` × `h` frame. */
export const makeGrain = (
  size: number,
  count: number,
  seed: number,
  w: number,
  h: number,
): Grain => ({
  size,
  sheets: Array.from({ length: count }, (_, k) => {
    const tile = grainTile(size, seed + k * 977);
    const { c, ctx } = offscreen(w + size, h + size);
    // An unshifted repeat onto a clear sheet copies the opaque tile exactly.
    const pattern = ctx.createPattern(tile, 'repeat');
    if (pattern !== null) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    return c;
  }),
});

/**
 * Where tick `boil` reads its grain sheet, written into `out`: the tile
 * shifted by (137, 71) px a tick, so repeated tiles never line up. Frame
 * pixel (x, y) shows tile pixel ((x + out[0]) mod size, (y + out[1]) mod size).
 */
export const grainShift = (out: Vec2, boil: number, size: number): Vec2 => {
  out[0] = (size - ((boil * 137) % size)) % size;
  out[1] = (size - ((boil * 71) % size)) % size;
  return out;
};

/** Scratch for a tick's sheet offset, written and read within one call. */
const shift: Vec2 = [0, 0];

/** Overlay grain across the frame; `strength` is the overlay alpha. */
export const grain = (
  ctx: CanvasRenderingContext2D,
  film: Grain,
  boil: number,
  w: number,
  h: number,
  strength = 0.07,
) => {
  const sheet = film.sheets[boil % film.sheets.length];
  if (sheet === undefined) return;
  grainShift(shift, boil, film.size);
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.globalCompositeOperation = 'overlay';
  ctx.drawImage(sheet, shift[0], shift[1], w, h, 0, 0, w, h);
  ctx.restore();
};

/** Darken the edges toward `color`: a radial gradient multiplied over the frame at `strength`. */
export const vignette = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
  strength = 0.35,
) => {
  const g = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.35,
    w / 2,
    h / 2,
    Math.hypot(w, h) * 0.6,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, color);
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
};

/**
 * The vignette drawn once, as a `w` × `h` sheet: `vignette` laid over white,
 * so each pixel holds the factor it scales a frame by. Multiplying a frame by
 * the sheet (`shadeBy`) darkens it as `vignette` does.
 */
export const makeVignette = (
  w: number,
  h: number,
  color: string,
  strength = 0.35,
): HTMLCanvasElement => {
  const { c, ctx } = offscreen(w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  vignette(ctx, w, h, color, strength);
  return c;
};

/** Multiply the frame by a sheet from `makeVignette`. */
export const shadeBy = (ctx: CanvasRenderingContext2D, sheet: HTMLCanvasElement) => {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(sheet, 0, 0);
  ctx.restore();
};
