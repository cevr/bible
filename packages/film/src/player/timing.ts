// What `film bench` asks the export page: how long each frame takes to draw,
// and a hash of its pixels. Both draw through the same `draw` the renderer
// encodes with, on the same canvas.

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
