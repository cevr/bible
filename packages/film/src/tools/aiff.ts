// An AIFF (or AIFF-C of plain PCM) read to planar samples: what a Mac's
// recorders save that mediabunny has no reader for. Integers scale over
// 2^(bits−1) of their whole bytes, as FFmpeg's PCM decoders scale them, so an
// AIFF take reads as the same take in any other container does. Pure: bytes
// in, samples or the reason not out.

import { Array as Arr, Match, Option, Result } from 'effect';
import type { Pcm } from '../core/audio.ts';

/** Four bytes at `at` as text: a chunk's id, or a form's kind. */
const fourcc = (bytes: Uint8Array, at: number) =>
  String.fromCharCode(...bytes.subarray(at, at + 4));

/** Whether `bytes` open as an AIFF or AIFF-C file. */
export const isAiff = (bytes: Uint8Array): boolean =>
  bytes.length >= 12 &&
  fourcc(bytes, 0) === 'FORM' &&
  (fourcc(bytes, 8) === 'AIFF' || fourcc(bytes, 8) === 'AIFC');

/** How the samples lie: integers big- or little-endian, or big-endian floats. */
type Encoding = 'int-be' | 'int-le' | 'float';

/** An AIFF-C compression type that is plain PCM, and the depth it fixes, if any. */
interface Layout {
  readonly encoding: Encoding;
  readonly bits: Option.Option<number>;
}

const LAYOUTS = new Map<string, Layout>([
  ['NONE', { encoding: 'int-be', bits: Option.none() }],
  ['twos', { encoding: 'int-be', bits: Option.none() }],
  ['sowt', { encoding: 'int-le', bits: Option.none() }],
  ['fl32', { encoding: 'float', bits: Option.some(32) }],
  ['FL32', { encoding: 'float', bits: Option.some(32) }],
  ['fl64', { encoding: 'float', bits: Option.some(64) }],
  ['FL64', { encoding: 'float', bits: Option.some(64) }],
]);

/** One chunk: its id, where its body starts, and its size. */
interface Chunk {
  readonly id: string;
  readonly body: number;
  readonly size: number;
}

/** The form's chunks in order; each is padded to an even length. */
const chunksOf = (bytes: Uint8Array, view: DataView): ReadonlyArray<Chunk> => {
  const chunks: Array<Chunk> = [];
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = view.getUint32(at + 4);
    chunks.push({ id: fourcc(bytes, at), body: at + 8, size });
    at += 8 + size + (size % 2);
  }
  return chunks;
};

/** An 80-bit IEEE 754 extended float (big-endian), as AIFF stores its rate. */
const extended = (view: DataView, at: number): number => {
  const exponent = view.getUint16(at) & 0x7fff;
  const mantissa = view.getUint32(at + 2) * 2 ** 32 + view.getUint32(at + 6);
  return mantissa * 2 ** (exponent - 16383 - 63);
};

/** What the COMM chunk says of the sound. */
interface Common {
  readonly channels: number;
  readonly frames: number;
  readonly bits: number;
  readonly rate: number;
  readonly encoding: Encoding;
}

/** Whether a COMM chunk describes a sound at all. */
const isSound = (common: Common) =>
  common.channels > 0 && common.bits > 0 && common.bits <= 64 && common.rate > 0;

/** The COMM chunk read: an AIFF-C names its compression after the rate. */
const commonOf = (view: DataView, chunk: Chunk, type: string): Result.Result<Common, string> =>
  Result.flatMap(
    Result.fromOption(
      Option.fromUndefinedOr(LAYOUTS.get(type)),
      () => `compressed AIFF-C (${type}); export WAV or FLAC`,
    ),
    (layout) => {
      const common: Common = {
        channels: view.getUint16(chunk.body),
        frames: view.getUint32(chunk.body + 2),
        bits: Option.getOrElse(layout.bits, () => view.getUint16(chunk.body + 6)),
        rate: extended(view, chunk.body + 8),
        encoding: layout.encoding,
      };
      return Result.filterOrFail(
        Result.succeed(common),
        isSound,
        () => 'a COMM chunk that describes no sound',
      );
    },
  );

type Read = (view: DataView, at: number) => number;

/** One sample at `at` as a float: integers left-justified in whole bytes, so a 12-bit one fills 16. */
const reader = (common: Common): Read =>
  Match.value({ encoding: common.encoding, width: Math.ceil(common.bits / 8) }).pipe(
    Match.when({ encoding: 'float', width: 8 }, (): Read => (v, at) => v.getFloat64(at)),
    Match.when({ encoding: 'float' }, (): Read => (v, at) => v.getFloat32(at)),
    Match.when({ width: 1 }, (): Read => (v, at) => v.getInt8(at) / 2 ** 7),
    Match.when(
      { width: 2 },
      ({ encoding }): Read =>
        (v, at) =>
          v.getInt16(at, encoding === 'int-le') / 2 ** 15,
    ),
    Match.when(
      { width: 3, encoding: 'int-le' },
      (): Read => (v, at) =>
        (v.getInt8(at + 2) * 65536 + v.getUint8(at + 1) * 256 + v.getUint8(at)) / 2 ** 23,
    ),
    Match.when(
      { width: 3 },
      (): Read => (v, at) =>
        (v.getInt8(at) * 65536 + v.getUint8(at + 1) * 256 + v.getUint8(at + 2)) / 2 ** 23,
    ),
    Match.orElse(
      ({ encoding }): Read =>
        (v, at) =>
          v.getInt32(at, encoding === 'int-le') / 2 ** 31,
    ),
  );

/** The SSND chunk's samples (after its offset): as many whole frames as it holds. */
const samplesOf = (bytes: Uint8Array, view: DataView, common: Common, sound: Chunk): Pcm => {
  const width = Math.ceil(common.bits / 8);
  const start = sound.body + 8 + view.getUint32(sound.body);
  const room = Math.max(0, Math.min(sound.body + sound.size, bytes.length) - start);
  const frames = Math.min(common.frames, Math.floor(room / (width * common.channels)));
  const read = reader(common);
  const channels = Array.from({ length: common.channels }, () => new Float32Array(frames));
  for (let f = 0; f < frames; f++)
    for (const [c, plane] of channels.entries())
      plane[f] = read(view, start + (f * common.channels + c) * width);
  return { rate: common.rate, frames, channels };
};

/** `bytes`, an AIFF or an AIFF-C of plain PCM, as planar samples at its own rate. */
export const readAiff = (bytes: Uint8Array): Result.Result<Pcm, string> => {
  if (!isAiff(bytes)) return Result.fail('not an AIFF file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks = chunksOf(bytes, view);
  const named = (id: string) =>
    Result.fromOption(
      Arr.findFirst(chunks, (chunk) => chunk.id === id),
      () => `no ${id} chunk`,
    );
  // A plain AIFF is big-endian integers; an AIFF-C names its layout after the rate.
  const typeOf = (comm: Chunk) =>
    Option.getOrElse(
      Option.map(
        Option.liftPredicate(bytes, () => fourcc(bytes, 8) === 'AIFC'),
        () => fourcc(bytes, comm.body + 18),
      ),
      () => 'NONE',
    );
  return Result.flatMap(named('COMM'), (comm) =>
    Result.flatMap(commonOf(view, comm, typeOf(comm)), (common) =>
      Result.map(named('SSND'), (sound) => samplesOf(bytes, view, common, sound)),
    ),
  );
};
