// A PNG read back by the standard's own rules, written here apart from the
// encoder: its signature, its chunks in order with their CRCs (a bitwise
// CRC-32, not zlib's), its header, and its rows unfiltered back to the
// raster's bytes, whichever filter each row was given. The decoder reads
// the encoder's back, and a PNG built here by hand in another colour type.

import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { drawFigure, PLAIN } from '../core/fixtures/figure.ts';
import type { Raster } from '../core/raster.ts';
import { Result } from 'effect';
import { decodePng, encodePng } from './png.ts';

/** CRC-32 (the PNG polynomial, reflected), a bit at a time. */
const crc32Bitwise = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
};

interface Chunk {
  readonly type: string;
  readonly data: Uint8Array;
  readonly crc: number;
  readonly typed: Uint8Array;
}

const chunksOf = (png: Uint8Array): ReadonlyArray<Chunk> => {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: Array<Chunk> = [];
  for (let at = 8; at < png.length;) {
    const length = view.getUint32(at);
    const typed = png.subarray(at + 4, at + 8 + length);
    chunks.push({
      type: new TextDecoder().decode(png.subarray(at + 4, at + 8)),
      data: png.subarray(at + 8, at + 8 + length),
      crc: view.getUint32(at + 8 + length),
      typed,
    });
    at += 12 + length;
  }
  return chunks;
};

/** PNG's prediction under filter `kind` from left `a`, up `b` and up-left `c`. */
const predicted = (kind: number, a: number, b: number, c: number): number => {
  const p = a + b - c;
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
  let paeth = c;
  if (pb <= pc) paeth = b;
  if (pa <= pb && pa <= pc) paeth = a;
  return [0, a, b, (a + b) >> 1, paeth][kind] ?? 0;
};

/** The rows of an 8-bit RGBA image, unfiltered (PNG's reconstruction); left of a row and above the first read as zero. */
const unfiltered = (bytes: Uint8Array, width: number, height: number): Uint8Array => {
  const stride = width * 4;
  const out = new Uint8Array(height * stride);
  let up = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const kind = bytes[y * (stride + 1)] ?? 0;
    const row = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const guess = predicted(kind, row[i - 4] ?? 0, up[i] ?? 0, up[i - 4] ?? 0);
      row[i] = ((bytes[y * (stride + 1) + 1 + i] ?? 0) + guess) & 0xff;
    }
    up = row;
  }
  return out;
};

/** A raster with a smooth gradient over its top half and a hash's noise below, so rows pick different filters. */
const RASTER: Raster = (() => {
  const [width, height] = [37, 23];
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const noise = ((x * 7919 + y * 104729) ^ (x * y * 31)) & 0xff;
      let [r, g] = [noise, 255 - noise];
      if (y < height / 2) [r, g] = [x * 6, y * 10];
      rgba.set([r, g, (x + y) * 4, 255], (y * width + x) * 4);
    }
  return { width, height, rgba };
})();

describe('encodePng', () => {
  const png = encodePng(RASTER);
  const chunks = chunksOf(png);

  test('opens with the signature, then IHDR, IDAT and IEND', () => {
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
  });

  test('each chunk carries the CRC-32 of its type and data', () => {
    for (const chunk of chunks) expect(chunk.crc).toBe(crc32Bitwise(chunk.typed));
    expect(chunks[2]?.crc).toBe(0xae426082);
  });

  test('the header names the size, 8-bit RGBA, deflate, adaptive filters and no interlace', () => {
    const header = chunks[0]?.data ?? new Uint8Array();
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    expect([view.getUint32(0), view.getUint32(4), ...header.subarray(8)]).toEqual([
      37, 23, 8, 6, 0, 0, 0,
    ]);
  });

  test('its rows unfilter back to the raster, byte for byte, each under a filter of its own', () => {
    const inflated = new Uint8Array(inflateSync(chunks[1]?.data ?? new Uint8Array()));
    expect(inflated.length).toBe(23 * (37 * 4 + 1));
    expect(unfiltered(inflated, 37, 23)).toEqual(RASTER.rgba);
    const kinds = new Set(Array.from({ length: 23 }, (_, y) => inflated[y * (37 * 4 + 1)]));
    expect(kinds.size).toBeGreaterThan(1);
  });
});

/** A PNG built by hand: its header for `colour` type at 8 bits, its rows each under filter 0. */
const pngOf = (
  width: number,
  height: number,
  colour: number,
  rows: ReadonlyArray<ReadonlyArray<number>>,
): Uint8Array => {
  const chunk = (type: string, data: Uint8Array) => {
    const typed = new Uint8Array([...new TextEncoder().encode(type), ...data]);
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(typed, 4);
    view.setUint32(8 + data.length, crc32Bitwise(typed));
    return out;
  };
  const head = new Uint8Array(13);
  new DataView(head.buffer).setUint32(0, width);
  new DataView(head.buffer).setUint32(4, height);
  head.set([8, colour, 0, 0, 0], 8);
  const raw = new Uint8Array(rows.flatMap((row) => [0, ...row]));
  return new Uint8Array([
    ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ...chunk('IHDR', head),
    ...chunk('IDAT', new Uint8Array(deflateSync(raw))),
    ...chunk('IEND', new Uint8Array()),
  ]);
};

describe("encodePng's rows", () => {
  // The filter bytes and filtered rows as the encoder chose them when it was pinned: a faster encoder chooses the same.
  const rowsOf = (raster: Raster) =>
    createHash('sha256')
      .update(inflateSync(chunksOf(encodePng(raster)).find((c) => c.type === 'IDAT')!.data))
      .digest('hex');

  test('are pinned byte for byte, each row under the filter it was given', () => {
    expect(rowsOf(RASTER)).toBe('88ed223d5f807a85abd723925beb5c1b0fc4ed39aa343c5b14518ffe43382185');
    expect(rowsOf(drawFigure(PLAIN))).toBe(
      '6deab1bae2c0ee90bff8a075ffdc738ded135823c5408f5c69fe8c7028667e82',
    );
  });
});

describe('decodePng', () => {
  test("reads the encoder's PNG back to its raster, byte for byte", () => {
    expect(Result.getOrThrow(decodePng(encodePng(RASTER)))).toEqual(RASTER);
  });

  test('reads RGB and grey PNGs as opaque RGBA', () => {
    const rgb = Result.getOrThrow(decodePng(pngOf(2, 1, 2, [[10, 20, 30, 40, 50, 60]])));
    expect([...rgb.rgba]).toEqual([10, 20, 30, 255, 40, 50, 60, 255]);
    const grey = Result.getOrThrow(decodePng(pngOf(2, 1, 0, [[7, 9]])));
    expect([...grey.rgba]).toEqual([7, 7, 7, 255, 9, 9, 9, 255]);
  });

  test('refuses what it cannot read, saying why', () => {
    const reason = (bytes: Uint8Array) =>
      Result.match(decodePng(bytes), {
        onFailure: (refusal) => refusal.reason,
        onSuccess: () => 'read',
      });
    expect(reason(new TextEncoder().encode('not a picture'))).toBe('no PNG signature');
    expect(reason(pngOf(1, 1, 3, [[0]]))).toBe('colour type 3 (a palette, or unknown)');
  });
});
