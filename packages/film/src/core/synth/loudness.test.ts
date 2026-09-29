import { describe, expect, test } from 'bun:test';
import type { Pcm } from '../audio.ts';
import { loudness } from './loudness.ts';

const RATE = 44100;

/** `secs` of a `hz` sine at linear `amp`, on each of `channels` channels. */
const sine = (hz: number, amp: number, secs: number, channels = 1): Pcm => {
  const frames = Math.round(secs * RATE);
  const plane = new Float32Array(frames);
  for (let i = 0; i < frames; i++) plane[i] = amp * Math.sin((2 * Math.PI * hz * i) / RATE);
  return { rate: RATE, frames, channels: Array.from({ length: channels }, () => plane.slice()) };
};

describe('loudness (ITU-R BS.1770-4)', () => {
  test('a full-scale 997 Hz sine on one channel reads -3.01 LUFS, its peak 0 dBFS', () => {
    const measured = loudness(sine(997, 1, 5));
    expect(measured.integrated).toBeCloseTo(-3.01, 1);
    expect(measured.momentaryMax).toBeCloseTo(-3.01, 1);
    expect(measured.peak).toBeCloseTo(0, 2);
  });

  test('the same sine on two channels reads 3 dB louder: channel powers add', () => {
    expect(loudness(sine(997, 1, 5, 2)).integrated).toBeCloseTo(0, 1);
  });

  test('20 dB quieter reads 20 LU lower', () => {
    expect(loudness(sine(997, 0.1, 5)).integrated).toBeCloseTo(-23.01, 1);
  });

  test('silence is -Infinity throughout', () => {
    const quiet = loudness({ rate: RATE, frames: RATE, channels: [new Float32Array(RATE)] });
    expect(quiet.integrated).toBe(Number.NEGATIVE_INFINITY);
    expect(quiet.momentaryMax).toBe(Number.NEGATIVE_INFINITY);
    expect(quiet.peak).toBe(Number.NEGATIVE_INFINITY);
  });

  test('a burst in silence: the momentary max finds the burst, the gate keeps the silence out', () => {
    const burst = sine(997, 0.5, 1);
    const frames = RATE * 6;
    const plane = new Float32Array(frames);
    plane.set(burst.channels[0] ?? new Float32Array(), RATE * 3);
    const measured = loudness({ rate: RATE, frames, channels: [plane] });
    expect(measured.momentaryMax).toBeCloseTo(-9.03, 0);
    // Only the blocks the burst reaches pass the absolute gate: 7 whole, 6 in part.
    expect(measured.integrated).toBeCloseTo(-10.17, 1);
  });

  test('a sound shorter than one 400 ms block is measured over the block', () => {
    const click = loudness(sine(997, 1, 0.1));
    expect(click.momentaryMax).toBeCloseTo(-3.01 - 6.02, 0);
  });
});
