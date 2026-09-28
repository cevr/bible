// Browser side of fibre.pixel.test.ts: soft-lights the paper fibre over a
// flat mid-tone plane and reports what a viewer would see: how far the mottle
// moves the tone (cell means over 32 px), how much fine fibre sits within a
// cell, and whether a pan slides the grain with the plane.

import { planeFibre } from '../fibre.ts';
import { offscreen } from '../paper.ts';

export interface FibreStats {
  /** The largest a 32 px cell's mean luma strays from the whole plane's, as a share of 255. */
  readonly mottle: number;
  /** The spread of single pixels about their cell's mean luma, as a share of 255. */
  readonly fibre: number;
  /** Mean luma difference between a panned frame and the unpanned one shifted by the pan, /255. */
  readonly panned: number;
  /** The same against the unpanned frame unshifted: what screen-fixed grain would score. */
  readonly screen: number;
  /** `panned` for a plane pushed in to zoom 1.5, its grain scaled with it. */
  readonly zoomed: number;
}

const S = 640;
const CELL = 32;
const PAN = 37;

const lumaOf = (d: Uint8ClampedArray, i: number) =>
  0.2126 * (d[i] ?? 0) + 0.7152 * (d[i + 1] ?? 0) + 0.0722 * (d[i + 2] ?? 0);

const plane = (x: number, zoom = 1) => {
  const { ctx } = offscreen(S, S);
  ctx.fillStyle = '#999999';
  ctx.fillRect(0, 0, S, S);
  planeFibre(ctx, { x, y: S / 2, zoom }, S, S);
  return ctx.getImageData(0, 0, S, S).data;
};

/** A pushed-in plane (zoom 1.5, a 480 px period) panned by 20 world px: the grain should move 30 px. */
const ZOOM = 1.5;
const ZOOM_PAN = 20;

/** Mean absolute luma difference of `b` at (x, y) against `a` at (x + dx, y), inside a margin. */
const drift = (a: Uint8ClampedArray, b: Uint8ClampedArray, dx: number) => {
  let sum = 0;
  let n = 0;
  for (let y = 40; y < S - 40; y++)
    for (let x = 40; x < S - 80; x++) {
      sum += Math.abs(lumaOf(b, (y * S + x) * 4) - lumaOf(a, (y * S + x + dx) * 4));
      n++;
    }
  return sum / n / 255;
};

/** How far the most-strayed 32 px cell's mean luma sits from the whole frame's, /255, and the pixels' spread within cells. */
const measure = (d: Uint8ClampedArray) => {
  const cells = S / CELL;
  const means: number[] = [];
  let spread = 0;
  for (let cy = 0; cy < cells; cy++)
    for (let cx = 0; cx < cells; cx++) {
      let sum = 0;
      for (let y = 0; y < CELL; y++)
        for (let x = 0; x < CELL; x++) sum += lumaOf(d, ((cy * CELL + y) * S + cx * CELL + x) * 4);
      const mean = sum / (CELL * CELL);
      means.push(mean);
      for (let y = 0; y < CELL; y++)
        for (let x = 0; x < CELL; x++)
          spread += (lumaOf(d, ((cy * CELL + y) * S + cx * CELL + x) * 4) - mean) ** 2;
    }
  const whole = means.reduce((a, b) => a + b, 0) / means.length;
  return {
    mottle: Math.max(...means.map((m) => Math.abs(m - whole))) / 255,
    fibre: Math.sqrt(spread / (S * S)) / 255,
  };
};

const fibreStats = (): FibreStats => {
  const d = plane(S / 2);
  const { mottle, fibre } = measure(d);
  const moved = plane(S / 2 + PAN);
  const pushed = plane(S / 2, ZOOM);
  const pushedMoved = plane(S / 2 + ZOOM_PAN, ZOOM);
  return {
    mottle,
    fibre,
    panned: drift(d, moved, PAN),
    screen: drift(d, moved, 0),
    zoomed: drift(pushed, pushedMoved, ZOOM_PAN * ZOOM),
  };
};

Object.assign(globalThis, { fibreStats });
