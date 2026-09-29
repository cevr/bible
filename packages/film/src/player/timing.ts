// What `film bench` asks the export page: how long each frame takes to draw,
// and a hash of its pixels. Both draw through the same `draw` the renderer
// encodes with, on the same canvas. And the look pass's small frames.

import { offscreen } from '../canvas/paper.ts';
import type { ProbeSink } from '../canvas/probe.ts';
import type { FaceMark, HandMark } from '../core/schema.ts';

/**
 * Milliseconds to draw each of `frames`, raster included: reading one pixel
 * back makes Chromium raster the frame before the clock stops, which it would
 * otherwise defer past it.
 */
export const timeFrames = (
  draw: (i: number) => void,
  ctx: CanvasRenderingContext2D,
  frames: ReadonlyArray<number>,
): ReadonlyArray<number> =>
  frames.map((i) => {
    const began = performance.now();
    draw(i);
    ctx.getImageData(0, 0, 1, 1);
    return performance.now() - began;
  });

/** FNV-1a over the pixels, a 32-bit word at a time: equal hashes, equal frames. */
const pixelHash = (data: Uint8ClampedArray): string => {
  const words = new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4);
  let h = 2166136261;
  for (const word of words) h = Math.imul(h ^ word, 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
};

/**
 * The look pass (`film check`, `film lookbook`): each of `frames` drawn by
 * `draw` into `sink`, then shrunk to a `w` × `h` RGBA thumb; the thumbs
 * end to end, and the faces and hands each frame declared.
 */
export const lookFrames = (
  draw: (i: number, sink: ProbeSink) => void,
  canvas: HTMLCanvasElement,
  frames: ReadonlyArray<number>,
  w: number,
  h: number,
) => {
  const small = offscreen(w, h);
  small.ctx.imageSmoothingEnabled = true;
  small.ctx.imageSmoothingQuality = 'high';
  const thumbs = new Uint8Array(frames.length * w * h * 4);
  const hands: HandMark[][] = [];
  const faces = frames.map((i, k) => {
    const found: FaceMark[] = [];
    const held: HandMark[] = [];
    draw(i, { texts: [], inks: [], faces: found, hands: held });
    small.ctx.clearRect(0, 0, w, h);
    small.ctx.drawImage(canvas, 0, 0, w, h);
    thumbs.set(small.ctx.getImageData(0, 0, w, h).data, k * w * h * 4);
    hands.push(held);
    return found;
  });
  return { thumbs, faces, hands };
};

/** A hash of each of `frames`' pixels. */
export const hashFrames = (
  draw: (i: number) => void,
  ctx: CanvasRenderingContext2D,
  frames: ReadonlyArray<number>,
): ReadonlyArray<string> =>
  frames.map((i) => {
    draw(i);
    return pixelHash(ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data);
  });
