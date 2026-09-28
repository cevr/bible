// What a page hands back for a frame's luma: one value per cell of the grid
// asked for. An empty read (no canvas to sample on) or a short one fails, so a
// loop is never compared on nothing and called clean. No Chromium.

import { describe, expect, test } from 'bun:test';
import { Result, Schema } from 'effect';
import { type LumaArea, lumaGrid } from './browser.ts';

const area: LumaArea = { x: 0, y: 620, w: 1080, h: 608, cols: 4, rows: 2 };
const read = (cells: ReadonlyArray<number>) => Schema.decodeResult(lumaGrid(area))(cells);

describe('lumaGrid', () => {
  test('takes one luma per cell of the grid', () => {
    expect(read([1, 2, 3, 4, 5, 6, 7, 8])).toEqual(Result.succeed([1, 2, 3, 4, 5, 6, 7, 8]));
  });

  test('refuses an empty read, and one a cell short', () => {
    expect(Result.isFailure(read([]))).toBe(true);
    expect(Result.isFailure(read([1, 2, 3, 4, 5, 6, 7]))).toBe(true);
  });
});
