// The bold look's inks and its few shapes. A poster's world: flat fields of
// four inks, hard edges, no line, no shadow, no grain of its own. Every shape
// is a filled rectangle, disc or polygon; nothing is stroked.

import type { Hex } from '@bible/film/canvas';

/**
 * Four flat inks and the colour script's two accents. The bone ground and the
 * slates are the cold open's cool room (saturation about 0.2); scarlet is only
 * ever on the accused's garment, gold only on the verdict and the Word.
 */
export const INK = {
  bone: '#e7e4dc',
  face: '#f4efe4',
  slate: '#4e6b78',
  deep: '#2b3c45',
  ink: '#16181b',
  panel: '#24272b',
  scarlet: '#ce0914',
  gold: '#e6b347',
} as const satisfies Record<string, Hex>;

/** The look's one face: a heavy grotesque, set tight. */
export const FACE = 'Inter';

export const rect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
};

export const disc = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
};

/** A half disc: the flat side along `angle`, the round side beyond it. */
export const half = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  angle: number,
  color: string,
) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, angle, angle + Math.PI);
  ctx.closePath();
  ctx.fill();
};

export const poly = (
  ctx: CanvasRenderingContext2D,
  pts: ReadonlyArray<readonly [number, number]>,
  color: string,
) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const [i, [x, y]] of pts.entries()) {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
};

/** A bar from (x0, y0) to (x1, y1), `w` thick, square-ended: a line drawn as a filled shape. */
export const bar = (
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  color: string,
) => {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len === 0) return;
  const nx = (-(y1 - y0) / len) * (w / 2);
  const ny = ((x1 - x0) / len) * (w / 2);
  poly(
    ctx,
    [
      [x0 + nx, y0 + ny],
      [x1 + nx, y1 + ny],
      [x1 - nx, y1 - ny],
      [x0 - nx, y0 - ny],
    ],
    color,
  );
};

/** A rectangle's frame, `t` thick: the outer box less the inner, filled even-odd. */
export const frame = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
  color: string,
) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.rect(x + t, y + t, w - 2 * t, h - 2 * t);
  ctx.fill('evenodd');
};
