// A raster as a PNG file's bytes, and back: written 8-bit RGBA, not
// interlaced, each row filtered by whichever of PNG's five filters leaves it
// smallest by the standard's heuristic (the least sum of absolute bytes),
// then deflated as one zlib stream; read from any 8-bit PNG that is not
// interlaced and holds no palette (grey, grey and alpha, RGB, RGBA), as an
// image model, a page or this writer saves one. Bun's `node:zlib` holds the
// deflate, the inflate and the chunk CRC, so a sound's sheet and a figure's
// concept need no image library (`sfx render --sheet`, `film lab match`).

import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { Option, Result, Schema } from 'effect';
import type { Raster } from '../core/raster.ts';

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

/** A PNG this reader does not read, and why. */
class PngUnreadable extends Schema.TaggedError<PngUnreadable>()('PngUnreadable', {
  reason: Schema.String,
}) {
  override get message() {
    return `the PNG does not read: ${this.reason}`;
  }
}

/**
 * How a colour type lays out a pixel: its channels, where its red, green and
 * blue are (grey's one channel stands for all three), and where its alpha is
 * (past the pixel's last channel when it has none, so it reads opaque).
 * Type 3, a palette, is not read.
 */
interface Layout {
  readonly channels: number;
  readonly rgb: readonly [number, number, number];
  readonly alpha: number;
}

const LAYOUTS = new Map<number, Layout>([
  [0, { channels: 1, rgb: [0, 0, 0], alpha: 1 }],
  [2, { channels: 3, rgb: [0, 1, 2], alpha: 3 }],
  [4, { channels: 2, rgb: [0, 0, 0], alpha: 1 }],
  [6, { channels: 4, rgb: [0, 1, 2], alpha: 3 }],
]);

const refused = (reason: string) => Result.fail(PngUnreadable.make({ reason }));

/** The PNG's header chunk and its pixel data's chunks joined, in order up to IEND. */
const chunksOf = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const idat: Array<Uint8Array> = [];
  let head = Option.none<Uint8Array>();
  for (let at = 8; at + 12 <= bytes.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') head = Option.some(data);
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') break;
    at += 12 + length;
  }
  const joined = new Uint8Array(idat.reduce((sum, part) => sum + part.length, 0));
  let put = 0;
  for (const part of idat) {
    joined.set(part, put);
    put += part.length;
  }
  return { head, joined };
};

/** The header's size and layout, or why this reader does not read it. */
const headerOf = (head: Option.Option<Uint8Array>) => {
  if (Option.isNone(head) || head.value.length < 13) return refused('no IHDR');
  const bytes = head.value;
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const [width, height] = [header.getUint32(0), header.getUint32(4)];
  const [depth, colour, interlace] = [bytes[8] ?? 0, bytes[9] ?? 0, bytes[12] ?? 0];
  const layout = Option.fromUndefinedOr(LAYOUTS.get(colour));
  if (depth !== DEPTH) return refused(`a bit depth of ${depth}, not 8`);
  if (Option.isNone(layout)) return refused(`colour type ${colour} (a palette, or unknown)`);
  if (interlace !== 0) return refused('it is interlaced');
  return Result.succeed({ width, height, layout: layout.value });
};

/**
 * The rows unfiltered, `channels` bytes a pixel. Each row is unfiltered
 * behind `channels` zero bytes, so the pixel left of a row's first reads 0
 * as the standard says.
 */
const unfilter = (raw: Uint8Array, width: number, height: number, channels: number) => {
  const stride = width * channels;
  const rows = new Uint8Array(height * stride);
  let above = new Uint8Array(stride + channels);
  for (let y = 0; y < height; y++) {
    const kind = raw[y * (stride + 1)] ?? 0;
    const row = new Uint8Array(stride + channels);
    for (let i = 0; i < stride; i++) {
      const byte = raw[y * (stride + 1) + 1 + i] ?? 0;
      const [left, up, upLeft] = [row[i] ?? 0, above[channels + i] ?? 0, above[i] ?? 0];
      row[channels + i] = (byte + predicted(kind, left, up, upLeft)) & 0xff;
    }
    rows.set(row.subarray(channels), y * stride);
    above = row;
  }
  return rows;
};

/** `bytes` read as a PNG: its pixels as RGBA, or why they cannot be. */
export const decodePng = (bytes: Uint8Array): Result.Result<Raster, PngUnreadable> => {
  if (bytes.length < 8 || SIGNATURE.some((byte, i) => bytes[i] !== byte))
    return refused('no PNG signature');
  const { head, joined } = chunksOf(bytes);
  return Result.flatMap(headerOf(head), ({ width, height, layout }) => {
    const { channels, rgb, alpha } = layout;
    const raw = Result.try(() => new Uint8Array(inflateSync(joined)));
    if (Result.isFailure(raw)) return refused('its pixel data does not inflate');
    if (raw.success.length < height * (width * channels + 1))
      return refused('its pixel data is short');
    const rows = unfilter(raw.success, width, height, channels);
    const rgba = new Uint8Array(width * height * CHANNELS);
    for (let k = 0; k < width * height; k++) {
      const p = rows.subarray(k * channels, (k + 1) * channels);
      rgba.set([p[rgb[0]] ?? 0, p[rgb[1]] ?? 0, p[rgb[2]] ?? 0, p[alpha] ?? 255], k * CHANNELS);
    }
    return Result.succeed({ width, height, rgba });
  });
};
