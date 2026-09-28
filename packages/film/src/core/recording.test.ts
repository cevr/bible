import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { type Pcm, levels } from './audio.ts';
import { TAKE_LEVEL, TAKE_PAD, prepareTake } from './recording.ts';

const RATE = 48000;

/**
 * `before` s of room noise, `secs` s of a 220 Hz tone at `amp`, then `after` s
 * of room noise, on `channels` channels.
 */
const recording = (before: number, secs: number, after: number, amp: number, channels = 1): Pcm => {
  const frames = Math.round((before + secs + after) * RATE);
  const plane = new Float32Array(frames);
  const from = Math.round(before * RATE);
  const to = from + Math.round(secs * RATE);
  for (let i = 0; i < frames; i++) {
    const noise = (((i * 7919) % 997) / 997 - 0.5) * 0.0004;
    const voice = Number(i >= from && i < to) * amp * Math.sin((2 * Math.PI * 220 * i) / RATE);
    plane[i] = voice + noise;
  }
  return { rate: RATE, frames, channels: Array.from({ length: channels }, () => plane.slice()) };
};

const secs = (pcm: Pcm) => pcm.frames / pcm.rate;

describe('prepareTake', () => {
  test('trims the silence to the staging takes padding, and levels the take to their loudness', () => {
    const take = Option.getOrThrow(prepareTake(recording(1.2, 2, 0.8, 0.05)));
    // The tone plus the staging lead; the tail is the tone's last window.
    expect(secs(take)).toBeGreaterThan(2 + TAKE_PAD.lead - 0.011);
    expect(secs(take)).toBeLessThan(2 + TAKE_PAD.lead + TAKE_PAD.tail + 0.011);
    const level = levels(take);
    expect(level.mean).toBeGreaterThan(TAKE_LEVEL.mean - 0.5);
    expect(level.mean).toBeLessThan(TAKE_LEVEL.mean + 0.5);
    expect(level.peak).toBeLessThanOrEqual(TAKE_LEVEL.ceiling + 0.01);
  });

  test('speech starts where the lead ends: the limiter delays nothing', () => {
    const take = Option.getOrThrow(prepareTake(recording(1, 1, 1, 0.3)));
    const plane = take.channels[0] ?? new Float32Array();
    const onset = plane.findIndex((x) => Math.abs(x) > 0.05);
    expect(Math.abs(onset / take.rate - TAKE_PAD.lead)).toBeLessThan(0.011);
  });

  test('a recording that starts on its first word still gets the staging lead, in silence', () => {
    const take = Option.getOrThrow(prepareTake(recording(0, 1, 0.5, 0.3)));
    const plane = take.channels[0] ?? new Float32Array();
    const onset = plane.findIndex((x) => Math.abs(x) > 0.05);
    expect(Math.abs(onset / take.rate - TAKE_PAD.lead)).toBeLessThan(0.011);
  });

  test('a loud take is brought down under the ceiling', () => {
    const take = Option.getOrThrow(prepareTake(recording(0.2, 1, 0.2, 1)));
    expect(levels(take).peak).toBeLessThanOrEqual(TAKE_LEVEL.ceiling + 0.01);
  });

  test('a stereo recording becomes one channel, at its own rate', () => {
    const take = Option.getOrThrow(prepareTake(recording(0.5, 1, 0.5, 0.1, 2)));
    expect(take.channels).toHaveLength(1);
    expect(take.rate).toBe(RATE);
  });

  test('a recording with nothing in it is no take', () => {
    const silent: Pcm = { rate: RATE, frames: RATE, channels: [new Float32Array(RATE)] };
    expect(Option.isNone(prepareTake(silent))).toBe(true);
  });

  test('a recording of only the room is no take, not the room raised 70 dB', () => {
    const hiss = Float32Array.from({ length: RATE }, (_, i) => ((i % 7) - 3) * 1e-5);
    expect(Option.isNone(prepareTake({ rate: RATE, frames: RATE, channels: [hiss] }))).toBe(true);
  });
});
