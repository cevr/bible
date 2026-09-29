// readAiff over AIFF files built here: 24-bit big-endian stereo, an AIFF-C
// of little-endian 16-bit ('sowt'), and the ones it refuses.

import { describe, expect, it } from 'bun:test';
import { Option, Result } from 'effect';
import { readAiff } from './aiff.ts';

/** An AIFF (or, given a `type`, an AIFF-C) of `channels` × `frames` samples, at 44.1 kHz. */
const aiff = (
  options: { channels: number; bits: number; type: Option.Option<string> },
  write: (view: DataView, at: number, index: number) => void,
  frames: number,
) => {
  const width = Math.ceil(options.bits / 8);
  // An AIFF-C's COMM also names its compression (and an empty name for it).
  const comm = 18 + Option.match(options.type, { onNone: () => 0, onSome: () => 6 });
  const sound = 8 + frames * options.channels * width;
  const bytes = new Uint8Array(12 + 8 + comm + 8 + sound);
  const view = new DataView(bytes.buffer);
  const tag = (at: number, id: string) => bytes.set(new TextEncoder().encode(id), at);
  tag(0, 'FORM');
  view.setUint32(4, bytes.length - 8);
  tag(8, Option.match(options.type, { onNone: () => 'AIFF', onSome: () => 'AIFC' }));
  tag(12, 'COMM');
  view.setUint32(16, comm);
  view.setUint16(20, options.channels);
  view.setUint32(22, frames);
  view.setUint16(26, options.bits);
  // 44100 as an 80-bit extended float.
  view.setUint16(28, 16383 + 15);
  view.setUint32(30, 44100 * 2 ** 16);
  Option.map(options.type, (type) => tag(38, type));
  const ssnd = 20 + comm;
  tag(ssnd, 'SSND');
  view.setUint32(ssnd + 4, sound);
  for (let i = 0; i < frames * options.channels; i++) write(view, ssnd + 16 + i * width, i);
  return bytes;
};

describe('readAiff', () => {
  it('reads 24-bit big-endian stereo as its integers over 2^23', () => {
    const value = (i: number) => (-1) ** i * i * 1000;
    const bytes = aiff(
      { channels: 2, bits: 24, type: Option.none() },
      (view, at, i) => {
        const v = value(i) & 0xffffff;
        view.setUint8(at, v >> 16);
        view.setUint8(at + 1, (v >> 8) & 0xff);
        view.setUint8(at + 2, v & 0xff);
      },
      100,
    );
    const pcm = Result.getOrThrow(readAiff(bytes));
    expect([pcm.rate, pcm.frames, pcm.channels.length]).toEqual([44100, 100, 2]);
    expect(pcm.channels[0]?.[3]).toBe(Math.fround(value(6) / 2 ** 23));
    expect(pcm.channels[1]?.[3]).toBe(Math.fround(value(7) / 2 ** 23));
  });

  it("reads an AIFF-C of little-endian 16-bit ('sowt')", () => {
    const bytes = aiff(
      { channels: 1, bits: 16, type: Option.some('sowt') },
      (view, at, i) => view.setInt16(at, i * 100 - 3000, true),
      60,
    );
    const pcm = Result.getOrThrow(readAiff(bytes));
    expect([...(pcm.channels[0] ?? [])]).toEqual(
      Array.from({ length: 60 }, (_, i) => (i * 100 - 3000) / 32768),
    );
  });

  it('refuses a compressed AIFF-C and a file that is not an AIFF', () => {
    const ima = aiff({ channels: 1, bits: 16, type: Option.some('ima4') }, () => {}, 4);
    expect(readAiff(ima)).toEqual(Result.fail('compressed AIFF-C (ima4); export WAV or FLAC'));
    expect(readAiff(new TextEncoder().encode('RIFF....WAVEfmt '))).toEqual(
      Result.fail('not an AIFF file'),
    );
  });
});
