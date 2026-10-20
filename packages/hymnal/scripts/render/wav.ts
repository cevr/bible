/**
 * 32-bit float WAV, the format the patched sampler writes and the master
 * reads: planar samples in, planar samples out. Pure.
 */

import type { Pcm } from '@bible/film/measure';
import { Schema } from 'effect';

/** A file that is not a 32-bit float WAV, and why. */
export class WavUnreadable extends Schema.TaggedError<WavUnreadable>()('WavUnreadable', {
  reason: Schema.String,
}) {}

const unreadable = (reason: string) => WavUnreadable.make({ reason });

const FLOAT = 3;
const EXTENSIBLE = 0xfffe;

interface Format {
  readonly channels: number;
  readonly rate: number;
  readonly bits: number;
  readonly code: number;
}

/** The `fmt ` chunk whose body starts at `body`; an extensible one by its sub-format. */
const formatAt = (view: DataView, body: number): Format => {
  const code = view.getUint16(body, true);
  return {
    code: code === EXTENSIBLE ? view.getUint16(body + 24, true) : code,
    channels: view.getUint16(body + 2, true),
    rate: view.getUint32(body + 4, true),
    bits: view.getUint16(body + 14, true),
  };
};

/** The `data` chunk's `length` bytes from `body`, de-interleaved by `format`. */
const planesAt = (
  view: DataView,
  body: number,
  length: number,
  format: Format | undefined,
): Pcm => {
  if (format === undefined) throw unreadable('data before fmt');
  if (format.code !== FLOAT || format.bits !== 32)
    throw unreadable(`format ${format.code} at ${format.bits} bits, not 32-bit float`);
  const frames = Math.floor(length / 4 / format.channels);
  const channels = Array.from({ length: format.channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++)
    for (const [c, plane] of channels.entries())
      plane[i] = view.getFloat32(body + (i * format.channels + c) * 4, true);
  return { rate: format.rate, frames, channels };
};

/** A float WAV's samples, one plane per channel. */
export const readWav = (bytes: Uint8Array): Pcm => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw unreadable('not a WAV file');
  let format: Format | undefined;
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (tag(at) === 'fmt ') format = formatAt(view, body);
    if (tag(at) === 'data')
      return planesAt(view, body, Math.min(size, bytes.length - body), format);
    at = body + size + (size % 2);
  }
  throw unreadable('no data chunk');
};

/** `pcm` as a 32-bit float WAV, its channels interleaved. */
export const writeWav = (pcm: Pcm): Uint8Array => {
  const channels = pcm.channels.length;
  const data = pcm.frames * channels * 4;
  const out = new Uint8Array(44 + data);
  const view = new DataView(out.buffer);
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) out[at + i] = text.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + data, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, FLOAT, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, pcm.rate, true);
  view.setUint32(28, pcm.rate * channels * 4, true);
  view.setUint16(32, channels * 4, true);
  view.setUint16(34, 32, true);
  ascii(36, 'data');
  view.setUint32(40, data, true);
  for (let i = 0; i < pcm.frames; i++)
    for (const [c, plane] of pcm.channels.entries())
      view.setFloat32(44 + (i * channels + c) * 4, plane[i] ?? 0, true);
  return out;
};
