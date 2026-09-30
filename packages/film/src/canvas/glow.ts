// Soft light a scene lays on its page: a sky, a vertical gradient over the
// whole frame, and a glow, a round light strongest at its heart. Each gradient
// is made once per context at unit size, by what it holds (a glow's colour, a
// sky's stops), and placed by the transform, as the contact shadow's is
// (`ground.ts`): a frame builds none once its lights are known. The fewest
// kept (`GRADIENTS_KEPT`), so a light whose colour moves every frame makes a
// gradient a frame but never holds more than a few.

import { clearOf } from './colour.ts';

/** The most unit gradients kept per context, of each kind. */
export const GRADIENTS_KEPT = 64;

/** Each context's unit gradients, by what they hold. */
const kept = (): WeakMap<CanvasRenderingContext2D, Map<string, CanvasGradient>> => new WeakMap();
const glows = kept();
const skies = kept();

/** `ctx`'s gradient under `key` in `by`, or none yet. */
const found = (
  by: WeakMap<CanvasRenderingContext2D, Map<string, CanvasGradient>>,
  ctx: CanvasRenderingContext2D,
  key: string,
): CanvasGradient | undefined => by.get(ctx)?.get(key);

/** Keep `made` as `ctx`'s gradient under `key`, letting go of the oldest past `GRADIENTS_KEPT`. */
const keep = (
  by: WeakMap<CanvasRenderingContext2D, Map<string, CanvasGradient>>,
  ctx: CanvasRenderingContext2D,
  key: string,
  made: CanvasGradient,
) => {
  let mine = by.get(ctx);
  if (mine === undefined) {
    mine = new Map();
    by.set(ctx, mine);
  }
  if (mine.size >= GRADIENTS_KEPT) {
    const oldest = mine.keys().next();
    if (oldest.done !== true) mine.delete(oldest.value);
  }
  mine.set(key, made);
  return made;
};

/**
 * A soft round light of hex `color` centred on (x, y), `r` across its
 * radius, strongest at its centre and clear at its rim, at `alpha` (past 1
 * counts as 1) of the context's own.
 */
export const glow = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha: number,
) => {
  if (alpha <= 0 || r <= 0) return;
  let g = found(glows, ctx, color);
  if (g === undefined) {
    const made = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    made.addColorStop(0, color);
    made.addColorStop(1, clearOf(color));
    g = keep(glows, ctx, color, made);
  }
  ctx.save();
  ctx.globalAlpha *= Math.min(1, alpha);
  ctx.translate(x, y);
  ctx.scale(r, r);
  ctx.fillStyle = g;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
};

/** A sky's stops as one key: each position and colour, in order. */
const skyKey = (stops: ReadonlyArray<readonly [number, string]>) => {
  let key = '';
  for (const [at, color] of stops) key += `${at} ${color};`;
  return key;
};

/** A vertical gradient over the whole `w` × `h` frame, top to bottom: `stops` are [position 0..1, colour]. */
export const sky = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  stops: ReadonlyArray<readonly [number, string]>,
) => {
  if (w <= 0 || h <= 0) return;
  const key = skyKey(stops);
  let g = found(skies, ctx, key);
  if (g === undefined) {
    const made = ctx.createLinearGradient(0, 0, 0, 1);
    for (const [at, color] of stops) made.addColorStop(at, color);
    g = keep(skies, ctx, key, made);
  }
  ctx.save();
  ctx.scale(1, h);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, 1);
  ctx.restore();
};
