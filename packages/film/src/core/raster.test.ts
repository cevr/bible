// A picture's crop, scale, placing side by side and strokes, on small
// pictures whose every pixel is known.

import { describe, expect, test } from 'bun:test';
import { besideRaster, cropRaster, type Raster, scaleRaster, strokeRaster } from './raster.ts';

/** A `width` × `height` picture, each pixel's red its column and green its row. */
const ramp = (width: number, height: number): Raster => {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) rgba.set([x, y, 0, 255], (y * width + x) * 4);
  return { width, height, rgba };
};

const pixel = (r: Raster, x: number, y: number) => [
  ...r.rgba.subarray((y * r.width + x) * 4, (y * r.width + x) * 4 + 4),
];

describe('raster', () => {
  test("a crop's box is held inside the picture, in whole pixels", () => {
    const held = cropRaster(ramp(20, 10), [-5, 2.5, 30.2, 9]);
    expect([held.width, held.height]).toEqual([20, 7]);
    expect(pixel(held, 0, 0)).toEqual([0, 2, 0, 255]);
    const past = cropRaster(ramp(20, 10), [30, 30, 40, 40]);
    expect([past.width, past.height]).toEqual([0, 0]);
  });

  test('a crop keeps the pixels inside its box', () => {
    const c = cropRaster(ramp(10, 10), [2, 3, 5, 7]);
    expect([c.width, c.height]).toEqual([3, 4]);
    expect(pixel(c, 0, 0)).toEqual([2, 3, 0, 255]);
    expect(pixel(c, 2, 3)).toEqual([4, 6, 0, 255]);
  });

  test('a scale blends between pixels', () => {
    const s = scaleRaster(ramp(4, 4), 2);
    expect([s.width, s.height]).toEqual([8, 8]);
    // Pixel 3 of 8 falls a quarter of the way past pixel 1 of 4.
    expect(pixel(s, 3, 0)[0]).toBe(1);
    expect(pixel(s, 4, 0)[0]).toBe(2);
  });

  test('pictures side by side meet at their tops, a fractional top to the nearest row', () => {
    const [a, b] = [ramp(4, 4), ramp(3, 6)];
    const both = besideRaster(
      [
        { raster: a, top: 0.6 },
        { raster: b, top: 2 },
      ],
      1,
    );
    expect([both.width, both.height]).toEqual([1 + 4 + 1 + 3 + 1, 1 + 6 + 1]);
    // b's top row at 1 + (2 − 2) = 1; a's at 1 + round(2 − 0.6) = 2, every row whole.
    expect(pixel(both, 6, 1)).toEqual([0, 0, 0, 255]);
    expect(pixel(both, 1, 2)).toEqual([0, 0, 0, 255]);
    expect(pixel(both, 4, 5)).toEqual([3, 3, 0, 255]);
    expect(pixel(both, 1, 1)).toEqual([255, 255, 255, 255]);
  });

  test('a stroke colours the pixels along its path and leaves the picture it was given', () => {
    const blank: Raster = { width: 10, height: 10, rgba: new Uint8Array(400).fill(255) };
    const square = strokeRaster(
      blank,
      [
        {
          points: [
            [2, 2],
            [8, 2],
            [8, 8],
            [2, 8],
          ],
          closed: true,
        },
      ],
      [200, 0, 100],
      2,
    );
    expect(pixel(square, 5, 2)).toEqual([200, 0, 100, 255]);
    // Closed: the last side, from (2, 8) back to (2, 2).
    expect(pixel(square, 2, 5)).toEqual([200, 0, 100, 255]);
    expect(pixel(square, 5, 5)).toEqual([255, 255, 255, 255]);
    expect(pixel(blank, 5, 2)).toEqual([255, 255, 255, 255]);
  });
});
