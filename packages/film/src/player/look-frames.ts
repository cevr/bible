// The look pass's small frames, drawn through the same `draw` the renderer
// encodes with, on the same canvas.

import { offscreen } from '../canvas/paper.ts';
import type { ProbeSink } from '../canvas/probe.ts';
import type { FaceMark, HandMark } from '../core/export-handle.ts';

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
