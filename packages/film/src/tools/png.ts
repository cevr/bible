// A raster as a PNG file's bytes: 8-bit RGBA, not interlaced, each row
// filtered by whichever of PNG's five filters leaves it smallest by the
// standard's heuristic (the least sum of absolute bytes), then deflated as
// one zlib stream. Bun's `node:zlib` holds both the deflate and the chunk
// CRC, so a sound's sheet needs no image library (`sfx render --sheet`).

import { crc32, deflateSync } from 'node:zlib';
import type { Raster } from '../core/synth/sheet.ts';

const SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
/** IHDR's bit depth and colour type: 8 bits a channel, RGBA. */
const DEPTH = 8;
const RGBA = 6;
const CHANNELS = 4;

/** A chunk: its length, its type, its data and the CRC of its type and data. */
const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const named = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(named, 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(data, crc32(named)));
  return out;
};

/** The header: the raster's size, 8-bit RGBA, deflate, adaptive filters, no interlace. */
const header = (raster: Raster): Uint8Array => {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, raster.width);
  view.setUint32(4, raster.height);
  data.set([DEPTH, RGBA, 0, 0, 0], 8);
  return data;
};

/** Paeth's predictor: whichever of left, up and up-left is nearest left + up − up-left. */
const paeth = (left: number, up: number, upLeft: number): number => {
  const guess = left + up - upLeft;
  const toLeft = Math.abs(guess - left);
  const toUp = Math.abs(guess - up);
  const toUpLeft = Math.abs(guess - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  if (toUp <= toUpLeft) return up;
  return upLeft;
};

/** What filter `kind` (0 none, 1 sub, 2 up, 3 average, 4 Paeth) predicts a byte is, from its neighbours. */
const predicted = (kind: number, left: number, up: number, upLeft: number): number => {
  switch (kind) {
    case 1:
      return left;
    case 2:
      return up;
    case 3:
      return (left + up) >> 1;
    case 4:
      return paeth(left, up, upLeft);
    default:
      return 0;
  }
};

/** `row` under filter `kind`, against `above` (zeros for the first row), into `out`. */
const filterRow = (kind: number, row: Uint8Array, above: Uint8Array, out: Uint8Array): void => {
  // The first pixel has nothing to its left: its left and up-left read as zero, as the standard reads them.
  for (let i = 0; i < CHANNELS; i++)
    out[i] = ((row[i] ?? 0) - predicted(kind, 0, above[i] ?? 0, 0)) & 0xff;
  for (let i = CHANNELS; i < row.length; i++) {
    const guess = predicted(kind, row[i - CHANNELS] ?? 0, above[i] ?? 0, above[i - CHANNELS] ?? 0);
    out[i] = ((row[i] ?? 0) - guess) & 0xff;
  }
};

/** A filtered row's cost: its bytes read as signed, summed by size (the standard's heuristic). */
const costOf = (filtered: Uint8Array): number => {
  let sum = 0;
  for (const byte of filtered) sum += Math.min(byte, 256 - byte);
  return sum;
};

/** Every row behind its filter byte, each with the filter that costs it least. */
const filtered = (raster: Raster): Uint8Array => {
  const stride = raster.width * CHANNELS;
  const out = new Uint8Array(raster.height * (stride + 1));
  const trial = new Uint8Array(stride);
  let above: Uint8Array = new Uint8Array(stride);
  for (let y = 0; y < raster.height; y++) {
    const row = raster.rgba.subarray(y * stride, (y + 1) * stride);
    const at = y * (stride + 1);
    let best = Number.POSITIVE_INFINITY;
    for (let kind = 0; kind < 5; kind++) {
      filterRow(kind, row, above, trial);
      const cost = costOf(trial);
      if (cost < best) {
        best = cost;
        out[at] = kind;
        out.set(trial, at + 1);
      }
    }
    above = row;
  }
  return out;
};

/** `raster` as the bytes of a PNG file. */
export const encodePng = (raster: Raster): Uint8Array => {
  const parts = [
    SIGNATURE,
    chunk('IHDR', header(raster)),
    chunk('IDAT', deflateSync(filtered(raster))),
    chunk('IEND', new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};
