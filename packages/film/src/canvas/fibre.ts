// Paper fibre (DIRECTION, "Grain"): grain is fixed to the paper it belongs to
// and moves with it, never with the screen: a 1–2 px fibre and a 50–150 px
// mottle at ±3–6 %. One tile holds both, built once from a seed and tiling
// without a seam. The backdrop of a multiplane shot carries it in its plane's
// space (`planeFibre`), so a pan slides the grain with the paper. A cutout
// face keeps its own pastel grain in its own space (`cutout.ts`): its
// pre-blended fill must match the two-pass look to rounding, and the fibre's
// broad soft blots drift it past that (5–9/255), so faces do not take them.

import { rng } from '../core/random.ts';
import type { Camera } from './camera.ts';
import { offscreen } from './paper.ts';

/** The tile's side in px. */
export const FIBRE_SIZE = 320;

/** How strongly the backdrop's fibre is soft-lit over it, 0..1. */
export const PLANE_FIBRE = 1;

let tile: HTMLCanvasElement | undefined;

/** Draw `paint` at every offset a tile's edge wraps to, so what crosses one edge comes in at the other. */
const wrapped = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  reach: number,
  paint: (x: number, y: number) => void,
) => {
  for (const dx of [-FIBRE_SIZE, 0, FIBRE_SIZE])
    for (const dy of [-FIBRE_SIZE, 0, FIBRE_SIZE]) {
      const px = x + dx;
      const py = y + dy;
      if (px + reach < 0 || py + reach < 0) continue;
      if (px - reach > FIBRE_SIZE || py - reach > FIBRE_SIZE) continue;
      paint(px, py);
    }
};

/**
 * The fibre tile: transparent, with soft light and dark blots (the mottle,
 * 50–150 px across) and short light and dark strands 1–2 px wide (the
 * fibre), for soft light over a plane: the mottle moves a mid-tone 3–6 %.
 * Built once.
 */
export const fibreTile = (): HTMLCanvasElement => {
  if (tile !== undefined) return tile;
  const { c, ctx } = offscreen(FIBRE_SIZE, FIBRE_SIZE);
  const r = rng(7331);
  // The mottle: soft blots, each fading from its heart to nothing.
  for (let i = 0; i < 26; i++) {
    const x = r() * FIBRE_SIZE;
    const y = r() * FIBRE_SIZE;
    const radius = 25 + r() * 50;
    const tone = r() > 0.5 ? 255 : 0;
    const alpha = 0.12 + r() * 0.08;
    wrapped(ctx, x, y, radius, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, radius);
      g.addColorStop(0, `rgba(${tone}, ${tone}, ${tone}, ${alpha})`);
      g.addColorStop(1, `rgba(${tone}, ${tone}, ${tone}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
    });
  }
  // The fibre: short strands, any direction.
  ctx.lineCap = 'round';
  for (let i = 0; i < 3200; i++) {
    const x = r() * FIBRE_SIZE;
    const y = r() * FIBRE_SIZE;
    const len = 2 + r() * 7;
    const a = r() * Math.PI;
    const dx = Math.cos(a) * len;
    const dy = Math.sin(a) * len;
    ctx.strokeStyle = r() > 0.5 ? '#ffffff' : '#000000';
    ctx.globalAlpha = 0.08 + r() * 0.14;
    ctx.lineWidth = 1 + r();
    wrapped(ctx, x, y, len + 2, (px, py) => {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + dx, py + dy);
      ctx.stroke();
    });
  }
  tile = c;
  return c;
};

/** The most tile scales kept at once; a push passes through a few, one per px of period. */
const SCALES_KEPT = 12;

/** The tile drawn at `period` px a side, wrapping still without a seam, by period. */
const scaled = new Map<number, HTMLCanvasElement>();

const scaledTile = (period: number): HTMLCanvasElement => {
  const have = scaled.get(period);
  if (have !== undefined) return have;
  if (period === FIBRE_SIZE) return fibreTile();
  const { c, ctx } = offscreen(period, period);
  ctx.imageSmoothingQuality = 'high';
  // Drawn at the tile's wrap offsets too, so the resampled edges wrap.
  for (const dx of [-period, 0, period])
    for (const dy of [-period, 0, period]) ctx.drawImage(fibreTile(), dx, dy, period, period);
  if (scaled.size >= SCALES_KEPT) {
    const oldest = scaled.keys().next();
    if (oldest.done !== true) scaled.delete(oldest.value);
  }
  scaled.set(period, c);
  return c;
};

/** One repeating pattern per context and tile, made once. */
const patterns = new WeakMap<
  CanvasRenderingContext2D,
  WeakMap<HTMLCanvasElement, CanvasPattern | null>
>();

const patternOf = (ctx: CanvasRenderingContext2D, tileOf: HTMLCanvasElement) => {
  let mine = patterns.get(ctx);
  if (mine === undefined) {
    mine = new WeakMap();
    patterns.set(ctx, mine);
  }
  const have = mine.get(tileOf);
  if (have !== undefined) return have;
  const made = ctx.createPattern(tileOf, 'repeat');
  mine.set(tileOf, made);
  return made;
};

/** `n` wrapped into [0, period). */
const wrap = (n: number, period: number) => ((n % period) + period) % period;

/**
 * Soft-light the fibre over the whole `w` × `h` frame as the plane seen
 * through `view` carries it, so it is anchored to the plane's world and
 * slides, turns and scales with it. `strength` 0..1 is its alpha. Soft light
 * is the look: it fades toward white and black, so light paper takes the
 * grain as lightly as the eye expects (a plain fill stains it).
 *
 * Unturned, the tile is pre-scaled to the plane's period in device px and
 * laid at a whole-pixel offset, so the software canvas never resamples it:
 * 6–8 ms a 1080p frame against about 20 ms through the plane's transform.
 * The period rounds to a whole px, so the grain sits within half a px a tile
 * of the plane's own scale. A turned camera lays it through the plane's
 * transform, sampled nearest.
 */
export const planeFibre = (
  ctx: CanvasRenderingContext2D,
  view: Camera,
  w: number,
  h: number,
  strength = PLANE_FIBRE,
) => {
  if (strength <= 0) return;
  const zoom = view.zoom ?? 1;
  const rot = view.rot ?? 0;
  const m = ctx.getTransform();
  ctx.save();
  ctx.globalAlpha *= strength;
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = 'soft-light';
  if (rot === 0 && m.b === 0 && m.c === 0 && m.a === m.d && m.a > 0) {
    const period = Math.max(8, Math.round(FIBRE_SIZE * zoom * m.a));
    const pattern = patternOf(ctx, scaledTile(period));
    if (pattern !== null) {
      // Where the plane's world origin lands, in device px.
      const ox = Math.round(wrap(m.a * (w / 2 - zoom * view.x) + m.e, period));
      const oy = Math.round(wrap(m.d * (h / 2 - zoom * view.y) + m.f, period));
      ctx.setTransform(1, 0, 0, 1, ox, oy);
      ctx.fillStyle = pattern;
      ctx.fillRect(m.e - ox, m.f - oy, m.a * w, m.d * h);
    }
    ctx.restore();
    return;
  }
  const pattern = patternOf(ctx, fibreTile());
  if (pattern !== null) {
    // The frame's corners in the plane's world lie within this half-extent
    // of the camera's point, however it is turned.
    const spread = (Math.abs(Math.cos(rot)) + Math.abs(Math.sin(rot))) / zoom;
    const hw = (w / 2) * spread + 2;
    const hh = (h / 2) * spread + 2;
    ctx.translate(w / 2, h / 2);
    if (rot !== 0) ctx.rotate(rot);
    ctx.scale(zoom, zoom);
    ctx.translate(-view.x, -view.y);
    ctx.fillStyle = pattern;
    ctx.fillRect(view.x - hw, view.y - hh, hw * 2, hh * 2);
  }
  ctx.restore();
};
