// Soft light a scene lays on its page: a sky, a vertical gradient over the
// whole frame; a wash, the same over any rect; and a glow, a round light
// strongest at its heart. Each gradient, and the contact shadow's
// (`ground.ts`), is a unit gradient: made once per context at unit size by
// what it holds (a glow's colour, a sky's stops) and placed by the
// transform, so a frame builds none once its lights are known. The fewest
// kept (`GRADIENTS_KEPT`) of each kind, so a light whose colour moves every
// frame makes a gradient a frame but never holds more than a few.
//
// Counted over righteousness-by-faith's frames on one context (pass 6, each
// unit gradient filled and made logged per frame): `message` fills 16.4 unit gradients a
// frame, 21,336 over its 1,304 frames, and makes 6; `within` 8,899 and makes
// 6; `daily`, whose glow changes colour every frame, 4,794 and makes 258.

import { type Clear, type Hex, clearOf } from './colour.ts';
import { keepAtMost } from './paper.ts';

/** The most unit gradients kept per context, of each kind. */
export const GRADIENTS_KEPT = 64;

/** What a unit gradient lights: each kind keeps its own. */
type UnitKind = 'glow' | 'sky' | 'ground';

const kept: Record<UnitKind, WeakMap<CanvasRenderingContext2D, Map<string, CanvasGradient>>> = {
  glow: new WeakMap(),
  sky: new WeakMap(),
  ground: new WeakMap(),
};

/**
 * `ctx`'s unit gradient of `kind` under `key`: the one kept, else `make(ctx,
 * of)`'s, kept (the oldest let go past `GRADIENTS_KEPT`). `key` names what
 * the gradient holds, so equal lights share one; `make` draws it at unit
 * size, from `of`, for the transform to place.
 */
export const unitGradient = <A>(
  ctx: CanvasRenderingContext2D,
  kind: UnitKind,
  key: string,
  make: (ctx: CanvasRenderingContext2D, of: A) => CanvasGradient,
  of: A,
): CanvasGradient => {
  const by = kept[kind];
  let mine = by.get(ctx);
  if (mine === undefined) {
    mine = new Map();
    by.set(ctx, mine);
  }
  const hit = mine.get(key);
  if (hit !== undefined) return hit;
  return keepAtMost(mine, key, make(ctx, of), GRADIENTS_KEPT);
};

/** A glow's gradient: the colour at its heart, the same colour clear at its rim. */
const glowGradient = (ctx: CanvasRenderingContext2D, color: Hex) => {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, color);
  g.addColorStop(1, clearOf(color));
  return g;
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
  color: Hex,
  alpha: number,
) => {
  if (alpha <= 0 || r <= 0) return;
  const g = unitGradient(ctx, 'glow', color, glowGradient, color);
  ctx.save();
  ctx.globalAlpha *= Math.min(1, alpha);
  ctx.translate(x, y);
  ctx.scale(r, r);
  ctx.fillStyle = g;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
};

/** A sky's stops as one key: each position and colour, in order. */
const skyKey = (stops: ReadonlyArray<readonly [number, Hex | Clear]>) => {
  let key = '';
  for (const [at, color] of stops) key += `${at} ${color};`;
  return key;
};

/** A wash's gradient: its stops down one unit. */
const washGradient = (
  ctx: CanvasRenderingContext2D,
  stops: ReadonlyArray<readonly [number, Hex | Clear]>,
) => {
  const g = ctx.createLinearGradient(0, 0, 0, 1);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
};

/**
 * A vertical gradient over the rect at (x, y), `w` × `h`, top to bottom:
 * `stops` are [position 0..1, colour]. A light that falls (a beam) is one.
 */
export const wash = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  stops: ReadonlyArray<readonly [number, Hex | Clear]>,
) => {
  if (w <= 0 || h <= 0) return;
  const g = unitGradient(ctx, 'sky', skyKey(stops), washGradient, stops);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, h);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, 1);
  ctx.restore();
};

/** A vertical gradient over the whole `w` × `h` frame, top to bottom: `stops` are [position 0..1, colour]. */
export const sky = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  stops: ReadonlyArray<readonly [number, Hex | Clear]>,
) => wash(ctx, 0, 0, w, h, stops);
