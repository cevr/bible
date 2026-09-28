// The studio's WAV, byte by byte: a RIFF/WAVE file of one channel of 24-bit
// little-endian PCM at the capture's own rate, so the take the server makes
// from it (a 24-bit FLAC master) loses nothing the microphone gave. Full scale
// is 2^23: a device's integer k, handed over as k / 2^23, comes back as k; a
// sample past [−2^23, 2^23 − 1] is clipped, never wrapped. A data chunk of odd
// length carries the RIFF pad byte.

import { describe, expect, test } from 'bun:test';
import { WAV_HEADER_BYTES, encodeWav, wavSeconds } from './wav.ts';

const ascii = (bytes: Uint8Array, at: number, n: number) =>
  String.fromCharCode(...bytes.subarray(at, at + n));

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** Sample `i` of a 24-bit mono WAV's data, sign-extended. */
const int24At = (bytes: Uint8Array, i: number) => {
  const at = WAV_HEADER_BYTES + i * 3;
  const raw = (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8) | ((bytes[at + 2] ?? 0) << 16);
  return (raw << 8) >> 8;
};

describe('encodeWav', () => {
  test('writes the canonical 44-byte header: RIFF, WAVE, PCM, mono, 24-bit, the rate', () => {
    const wav = encodeWav({ rate: 48000, samples: new Float32Array(10) });
    const v = view(wav);
    expect(wav.length).toBe(44 + 30);
    expect(ascii(wav, 0, 4)).toBe('RIFF');
    expect(v.getUint32(4, true)).toBe(36 + 30);
    expect(ascii(wav, 8, 4)).toBe('WAVE');
    expect(ascii(wav, 12, 4)).toBe('fmt ');
    expect(v.getUint32(16, true)).toBe(16);
    expect(v.getUint16(20, true)).toBe(1);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint32(28, true)).toBe(48000 * 3);
    expect(v.getUint16(32, true)).toBe(3);
    expect(v.getUint16(34, true)).toBe(24);
    expect(ascii(wav, 36, 4)).toBe('data');
    expect(v.getUint32(40, true)).toBe(30);
  });

  test('keeps the capture rate it is given', () => {
    const v = view(encodeWav({ rate: 44100, samples: new Float32Array(1) }));
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint32(28, true)).toBe(132300);
  });

  test('writes each sample as three little-endian bytes of signed 24-bit PCM', () => {
    const wav = encodeWav({ rate: 48000, samples: Float32Array.of(0, 1, -1, 0.5, -0.5) });
    expect([...wav.subarray(44, 47)]).toEqual([0, 0, 0]);
    // +1.0 is one step past the largest positive code, so it clamps to it.
    expect([...wav.subarray(47, 50)]).toEqual([0xff, 0xff, 0x7f]);
    // −1.0 is the most negative code exactly.
    expect([...wav.subarray(50, 53)]).toEqual([0x00, 0x00, 0x80]);
    expect(int24At(wav, 3)).toBe(4194304);
    expect(int24At(wav, 4)).toBe(-4194304);
  });

  test('gives back the integer a device handed over as k / 2^23, at every level', () => {
    // The device's ints reach the page as k / 2^23 (Chromium and CoreAudio
    // alike); scaling by 2^23 − 1 would move each one above half scale by one
    // step.
    const ks = [1, 3, 255, 4194303, 4194304, 6291456, 8388352, 8388607, -1, -6291456, -8388608];
    const wav = encodeWav({ rate: 48000, samples: Float32Array.from(ks, (k) => k / 0x800000) });
    expect(ks.map((_, i) => int24At(wav, i))).toEqual(ks);
  });

  test('keeps a quiet sample a 16-bit file would round away', () => {
    const quiet = 3 / 0x800000;
    const wav = encodeWav({ rate: 48000, samples: Float32Array.of(quiet, -quiet) });
    expect(int24At(wav, 0)).toBe(3);
    expect(int24At(wav, 1)).toBe(-3);
  });

  test('clips a sample past full scale instead of wrapping it', () => {
    const wav = encodeWav({ rate: 48000, samples: Float32Array.of(1.5, -2) });
    expect(int24At(wav, 0)).toBe(8388607);
    expect(int24At(wav, 1)).toBe(-8388608);
  });

  test('an odd data chunk is padded to an even length, counted in RIFF but not in data', () => {
    const wav = encodeWav({ rate: 48000, samples: Float32Array.of(0.25) });
    const v = view(wav);
    expect(wav.length).toBe(44 + 3 + 1);
    expect(v.getUint32(4, true)).toBe(36 + 3 + 1);
    expect(v.getUint32(40, true)).toBe(3);
    expect(wav[47]).toBe(0);
    expect(wavSeconds(wav)).toBe(1 / 48000);
  });

  test('says how long it plays', () => {
    const wav = encodeWav({ rate: 48000, samples: new Float32Array(72000) });
    expect(wavSeconds(wav)).toBe(1.5);
  });
});
