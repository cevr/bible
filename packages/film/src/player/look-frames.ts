// The look pass's small frames, drawn through the same `draw` the renderer
// encodes with, on the same canvas.

import { offscreen } from '../canvas/paper.ts';
import type { ProbeSink } from '../canvas/probe.ts';
import type { FaceMark, HandMark } from '../core/export-handle.ts';

/**
 * The look pass (`film check`, `film lookbook`): each of `frames` drawn by
 * `draw` into `sink` (done once the frame's footage is decoded and it is
 * drawn), then shrunk to a `w` × `h` RGBA thumb; the thumbs end to end, and
 * the faces and hands each frame declared. One frame at a time, in order.
 */
export const lookFrames = async (
  draw: (i: number, sink: ProbeSink) => Promise<void>,
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
  const faces = await frames.reduce<Promise<ReadonlyArray<ReadonlyArray<FaceMark>>>>(
    async (before, i, k) => {
      const done = await before;
      const found: FaceMark[] = [];
      const held: HandMark[] = [];
      await draw(i, { texts: [], inks: [], faces: found, hands: held });
      small.ctx.clearRect(0, 0, w, h);
      small.ctx.drawImage(canvas, 0, 0, w, h);
      thumbs.set(small.ctx.getImageData(0, 0, w, h).data, k * w * h * 4);
      hands.push(held);
      return [...done, found];
    },
    Promise.resolve([]),
  );
  return { thumbs, faces, hands };
};
