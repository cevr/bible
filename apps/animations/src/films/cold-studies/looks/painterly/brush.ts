// The painterly look's brush: every form is painted, not filled. A form is a
// silhouette (its shape, a path the brush is clipped to, so silhouettes stay
// strong) and a material (a ramp of five paints, shadow to light). The brush
// lays a dark underpainting, then covers it with dabs: short, broad strokes
// on a grid fixed to the world, each turned along the form's stroke direction
// and loaded with the paint the light at that point asks for (`tone`), give
// or take a little, so the colour breaks the way oil does. The grid is the
// world's and its pitch keeps a dab about the same size on the canvas at any
// zoom (in steps of two, so a push never makes the strokes swim); only the
// cells the camera sees are painted. Every dab is a hash of its cell: the
// same frame paints the same strokes, whenever and wherever it is drawn.

import { type Box, type Hex, mix } from '@bible/film/canvas';
import { clamp, hash2 } from '@bible/film/core';
import type { Ramp } from './palette.ts';

/** What the camera sees: the world rectangle on the canvas, and the world's units per device pixel. */
export interface Easel {
  readonly ctx: CanvasRenderingContext2D;
  readonly view: Box;
  readonly px: number;
}

/** A silhouette: adds its subpaths to the context's current path. */
export type Shape = (ctx: CanvasRenderingContext2D) => void;

/** How a form is brushed. */
export interface Stroke {
  readonly ramp: Ramp;
  /** The light at a point of the world: 0 the ramp's shadow, 1 its light. */
  readonly tone: (x: number, y: number) => number;
  /** The form's bounds in the world: only its cells are brushed. */
  readonly box: Box;
  /** A seed of its own, so two forms never share their strokes. */
  readonly seed: number;
  /** The strokes' direction, radians (0 along x). */
  readonly dir?: number;
  /** How far each stroke turns from `dir`, radians either way. */
  readonly spread?: number;
  /** A dab's length on the canvas, device px. */
  readonly size?: number;
  /** A dab's width over its length. */
  readonly ratio?: number;
  /** How far a dab's paint strays from the light's, in tone. */
  readonly jitter?: number;
  /** How the strokes turn across the form, radians at a point, over `dir`: they follow it. */
  readonly turn?: (x: number, y: number) => number;
  /** How opaque a dab's paint is. */
  readonly load?: number;
  /** Broken colour: a share of the dabs (0–1) loaded with another paint, a cool in a warm form or a warm in a cool. */
  readonly accent?: { readonly color: Hex; readonly share: number };
  /** How many dabs a cell holds, over one. */
  readonly density?: number;
}

/** The paint `t` of the way along a ramp, mixed between its two nearest paints. */
export const paintAt = (ramp: Ramp, t: number): Hex => {
  const k = clamp(t) * 4;
  const i = Math.min(3, Math.floor(k));
  return mix(ramp[i] ?? ramp[0], ramp[i + 1] ?? ramp[4], k - i);
};

/** The most dabs one form is given on a frame, however near the camera is. */
const MOST = 4000;

/**
 * The share of the grid's dabs laid. The underpainting already covers the
 * form, so the dabs are its texture, not its coverage: a third of them, a
 * little longer, read as the same brushwork for a third of the cost.
 */
const LAID = 0.34;

/** The frame's width in brush pixels: a dab's size is measured on a frame this wide, whatever the render's scale, so the look holds at every scale. */
export const BRUSH_PX = 960;

/** The loads of paint a form's dabs are sorted into, one fill each. */
const LOADS = 8;

/** The values the underpainting is laid in. */
const UNDER = 12;

const TAU = Math.PI * 2;

/** The part of a form the camera sees, in the world: its corners. */
interface Area {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** The underpainting: the light laid in broad flat patches, `cell` across, along `dir`. */
const underpaint = (
  ctx: CanvasRenderingContext2D,
  s: Stroke,
  a: Area,
  cell: number,
  dir: number,
) => {
  const under: number[][] = Array.from({ length: UNDER }, () => []);
  for (let y = Math.floor(a.y0 / cell) * cell; y < a.y1; y += cell)
    for (let x = Math.floor(a.x0 / cell) * cell; x < a.x1; x += cell) {
      const level = Math.min(
        UNDER - 1,
        Math.floor(clamp(s.tone(x + cell / 2, y + cell / 2)) * UNDER),
      );
      under[level]?.push(x, y);
    }
  for (const [n, cells] of under.entries()) {
    if (cells.length === 0) continue;
    ctx.fillStyle = paintAt(s.ramp, (n + 0.5) / UNDER);
    ctx.beginPath();
    // Each patch an oval laid along the stroke, wide enough (its short radius past the cell's half-diagonal) to leave no gap.
    for (let c = 0; c < cells.length; c += 2) {
      const cx = (cells[c] ?? 0) + cell / 2;
      const cy = (cells[c + 1] ?? 0) + cell / 2;
      ctx.moveTo(cx + Math.cos(dir) * cell * 0.95, cy + Math.sin(dir) * cell * 0.95);
      ctx.ellipse(cx, cy, cell * 0.95, cell * 0.74, dir, 0, TAU);
    }
    ctx.fill();
  }
};

/**
 * The dabs over the area, on a grid `pitch` apart fixed in the world (so they
 * hold still as the camera moves), each sorted into the load its tone takes:
 * five numbers a dab (x, y, turn, length, a seed for its width). The second
 * eight loads are the accent's.
 */
const sortDabs = (s: Stroke, a: Area, pitch: number) => {
  const dir = s.dir ?? -0.5;
  const spread = s.spread ?? 0.25;
  const jitter = s.jitter ?? 0.07;
  const per = Math.max(1, Math.round(s.density ?? 1));
  const len = pitch * 3.1;
  const share = s.accent?.share ?? 0;
  const loads: number[][] = Array.from({ length: LOADS * 2 }, () => []);
  const i0 = Math.floor(a.x0 / pitch) - 1;
  const i1 = Math.ceil(a.x1 / pitch) + 1;
  const j0 = Math.floor(a.y0 / pitch) - 1;
  const j1 = Math.ceil(a.y1 / pitch) + 1;
  // Each grid point keeps its dab by its own seed, so thinning never shows as a pattern.
  const keep = Math.min(LAID, MOST / Math.max(1, (i1 - i0 + 1) * (j1 - j0 + 1) * per));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++)
      for (let k = 0; k < per; k++) {
        if (hash2(i * 3 + k * 5, j * 5 + s.seed * 3 + 11) >= keep) continue;
        const h = hash2(i * 7919 + s.seed + k * 104729, j * 6271 - s.seed);
        const h2 = hash2(j * 31 + k, i * 17 + s.seed);
        const h3 = hash2(i + 3 * k, j + s.seed * 13);
        const x = (i + h) * pitch;
        const y = (j + h2) * pitch;
        const tone = clamp(s.tone(x, y) + (h3 - 0.5) * 2 * jitter);
        const accented = hash2(i * 13 + k, j * 29 + s.seed) < share;
        const load = Math.min(LOADS - 1, Math.floor(tone * LOADS)) + (accented ? LOADS : 0);
        const turn = s.turn?.(x, y) ?? 0;
        loads[load]?.push(x, y, dir + turn + (h2 - 0.5) * 2 * spread, len * (0.7 + 0.6 * h3), h);
      }
  return loads;
};

/** The sorted dabs laid, one fill a load: the accent's loads its hue mixed into the paint the tone takes, so the value holds. */
const layDabs = (
  ctx: CanvasRenderingContext2D,
  s: Stroke,
  loads: ReadonlyArray<ReadonlyArray<number>>,
) => {
  const ratio = s.ratio ?? 0.26;
  ctx.globalAlpha *= s.load ?? 0.8;
  for (const [n, dabs] of loads.entries()) {
    if (dabs.length === 0) continue;
    const own = paintAt(s.ramp, ((n % LOADS) + 0.5) / LOADS);
    ctx.fillStyle = n >= LOADS ? mix(own, s.accent?.color ?? own, 0.4) : own;
    ctx.beginPath();
    for (let d = 0; d < dabs.length; d += 5) {
      const x = dabs[d] ?? 0;
      const y = dabs[d + 1] ?? 0;
      const rot = dabs[d + 2] ?? 0;
      const l = dabs[d + 3] ?? 1;
      const w = l * ratio * (0.8 + 0.4 * (dabs[d + 4] ?? 0));
      ctx.moveTo(x + Math.cos(rot) * l * 0.5, y + Math.sin(rot) * l * 0.5);
      ctx.ellipse(x, y, l * 0.5, w * 0.5, rot, 0, TAU);
    }
    ctx.fill();
  }
};

/** The form `shape` painted in `s`: its underpainting and its dabs, clipped to it, only where the camera sees it. */
export const paint = (e: Easel, shape: Shape, s: Stroke) => {
  const { ctx, view } = e;
  const a: Area = {
    x0: Math.max(s.box.x, view.x),
    y0: Math.max(s.box.y, view.y),
    x1: Math.min(s.box.x + s.box.w, view.x + view.w),
    y1: Math.min(s.box.y + s.box.h, view.y + view.h),
  };
  if (a.x1 <= a.x0 || a.y1 <= a.y0) return;
  // The grid's pitch, in world units, in steps of two (so a push in changes it seldom, and all at once).
  const pitch = 2 ** Math.round(Math.log2(Math.max(0.05, (s.size ?? 16) * 0.4 * e.px)));
  ctx.save();
  ctx.beginPath();
  shape(ctx);
  ctx.clip();
  underpaint(ctx, s, a, pitch * 4, s.dir ?? -0.5);
  layDabs(ctx, s, sortDabs(s, a, pitch));
  ctx.restore();
};

/** Where a form is placed: moved, turned, scaled, and mirrored to face the other way. */
export interface Place {
  readonly x: number;
  readonly y: number;
  readonly rot?: number;
  readonly scale?: number;
  readonly flip?: boolean;
}

/** `draw` in the space `p` places it in, with the camera's view carried into that space. */
export const within = (e: Easel, p: Place, draw: (e: Easel) => void) => {
  const { ctx, view } = e;
  const rot = p.rot ?? 0;
  const s = p.scale ?? 1;
  const fx = p.flip === true ? -1 : 1;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(rot);
  ctx.scale(s * fx, s);
  const c = Math.cos(-rot);
  const n = Math.sin(-rot);
  const corners = [
    [view.x, view.y],
    [view.x + view.w, view.y],
    [view.x, view.y + view.h],
    [view.x + view.w, view.y + view.h],
  ].map(([wx = 0, wy = 0]): [number, number] => {
    const dx = wx - p.x;
    const dy = wy - p.y;
    return [((c * dx - n * dy) / s) * fx, (n * dx + c * dy) / s];
  });
  draw({ ctx, view: boxOf(corners), px: e.px / s });
  ctx.restore();
};

/** A closed curve through `pts` (Catmull-Rom, as Béziers), added to the current path. */
export const curve =
  (pts: ReadonlyArray<readonly [number, number]>, tension = 1): Shape =>
  (ctx) => {
    const n = pts.length;
    if (n < 3) return;
    const p = (i: number) => pts[((i % n) + n) % n] ?? [0, 0];
    const [sx, sy] = p(0);
    ctx.moveTo(sx, sy);
    for (let i = 0; i < n; i++) {
      const [ax, ay] = p(i - 1);
      const [bx, by] = p(i);
      const [cx, cy] = p(i + 1);
      const [dx, dy] = p(i + 2);
      const k = tension / 6;
      ctx.bezierCurveTo(
        bx + (cx - ax) * k,
        by + (cy - ay) * k,
        cx - (dx - bx) * k,
        cy - (dy - by) * k,
        cx,
        cy,
      );
    }
    ctx.closePath();
  };

/** A polygon through `pts`, added to the current path. */
export const poly =
  (pts: ReadonlyArray<readonly [number, number]>): Shape =>
  (ctx) => {
    for (const [i, [x, y]] of pts.entries()) {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

/** A rectangle, added to the current path. */
export const rect =
  (b: Box): Shape =>
  (ctx) =>
    ctx.rect(b.x, b.y, b.w, b.h);

/** An ellipse, added to the current path. */
export const oval =
  (x: number, y: number, rx: number, ry: number, rot = 0): Shape =>
  (ctx) => {
    ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
    ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
  };

/** The bounds of `pts`, widened by `pad`. */
export const boxOf = (pts: ReadonlyArray<readonly [number, number]>, pad = 0): Box => {
  const xs = pts.map(([x]) => x);
  const ys = pts.map(([, y]) => y);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
};

/** How far (x, y) lies along the line from (ax, ay) to (bx, by): 0 at a, 1 at b. */
export const along = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax;
  const dy = by - ay;
  return clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1));
};

/** 1 at (cx, cy), falling smoothly to 0 at `r` from it. */
export const pool = (x: number, y: number, cx: number, cy: number, r: number) => {
  const d = clamp(Math.hypot(x - cx, y - cy) / r);
  return (1 - d) * (1 - d);
};

/**
 * Light that falls off a source: a soft radial glow of `color` at (x, y),
 * `r` wide, laid over what is painted with a screen, so light only lightens.
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
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = clamp(alpha);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(0.35, mix(color, '#000000', 0.55));
  g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  ctx.restore();
};

/** Shadow laid over what is painted: a soft dark of `color` over `shape`, `alpha` deep. */
export const shade = (ctx: CanvasRenderingContext2D, shape: Shape, color: Hex, alpha: number) => {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp(alpha);
  ctx.fillStyle = color;
  ctx.beginPath();
  shape(ctx);
  ctx.fill();
  ctx.restore();
};
