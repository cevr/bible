// The paper under everything, and the grain over everything. Both are built
// once from a seed; grain cycles through a few tiles on the boil tick so the
// surface feels alive without flickering at the full frame rate.

import { fbm, hash2, rng } from '../core/random.ts';

export interface PaperStyle {
  base: string;
  /** Colour of the fibres and mottling. */
  tone: string;
  seed: number;
}

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx === null) throw new Error('2d context unavailable');
  return { c, ctx };
};

/** A full-frame sheet: base colour, soft mottling, fibres, and flecks. */
export const makePaper = (w: number, h: number, style: PaperStyle): HTMLCanvasElement => {
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = style.base;
  ctx.fillRect(0, 0, w, h);

  // Mottling: low-resolution fractal noise, upscaled smoothly.
  const lw = Math.ceil(w / 8);
  const lh = Math.ceil(h / 8);
  const low = canvas(lw, lh);
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

/** Tileable-enough grain tiles; the film cycles them on the boil tick. */
export const makeGrain = (size: number, count: number, seed: number): HTMLCanvasElement[] =>
  Array.from({ length: count }, (_, k) => {
    const { c, ctx } = canvas(size, size);
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const v = hash2(i, seed + k * 977) * 255;
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  });

/** Overlay grain across the frame; `strength` is the overlay alpha. */
export const grain = (
  ctx: CanvasRenderingContext2D,
  tiles: ReadonlyArray<HTMLCanvasElement>,
  boil: number,
  w: number,
  h: number,
  strength = 0.07,
) => {
  const tile = tiles[boil % tiles.length];
  if (tile === undefined) return;
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.globalCompositeOperation = 'overlay';
  const pattern = ctx.createPattern(tile, 'repeat');
  if (pattern !== null) {
    // Shift the pattern each tick so repeated tiles never line up.
    pattern.setTransform(
      new DOMMatrix().translate((boil * 137) % tile.width, (boil * 71) % tile.height),
    );
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
};

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
