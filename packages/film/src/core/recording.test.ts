import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { type Pcm, concat, levels } from './audio.ts';
import { TAKE_LEVEL, TAKE_PAD, prepareTake, speechLevel } from './recording.ts';

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

/** Recordings one after another. */
const joined = (...parts: ReadonlyArray<Pcm>): Pcm => concat(RATE, 1, parts);

describe('prepareTake', () => {
  test('trims the silence to the staging takes padding, and levels the take to their loudness', () => {
    const take = Option.getOrThrow(prepareTake(recording(1.2, 2, 0.8, 0.05)));
    // The tone plus the staging lead; the tail is the tone's last window.
    expect(secs(take)).toBeGreaterThan(2 + TAKE_PAD.lead - 0.011);
    expect(secs(take)).toBeLessThan(2 + TAKE_PAD.lead + TAKE_PAD.tail + 0.011);
    expect(speechLevel(take)).toBeGreaterThan(TAKE_LEVEL.speech - 0.2);
    expect(speechLevel(take)).toBeLessThan(TAKE_LEVEL.speech + 0.2);
    expect(levels(take).peak).toBeLessThanOrEqual(TAKE_LEVEL.ceiling + 0.01);
  });

  test('a pause in the line changes nothing about how loud its words are', () => {
    const straight = Option.getOrThrow(prepareTake(recording(0.5, 2, 0.5, 0.05)));
    const paused = Option.getOrThrow(
      prepareTake(joined(recording(0.5, 1, 1, 0.05), recording(1, 1, 0.5, 0.05))),
    );
    // The same tone at the same gain: the pause is not averaged into the level.
    expect(Math.abs(levels(paused).peak - levels(straight).peak)).toBeLessThan(0.1);
  });

  test("a take whose peak would pass the ceiling is levelled by one gain, only as far as the ceiling: the voice's shape untouched", () => {
    // A quiet line ending on a sharp consonant 18 times louder: a big peak, little power.
    const source = joined(recording(0.3, 1, 0, 0.05), recording(0, 0.02, 0.3, 0.9));
    const take = Option.getOrThrow(prepareTake(source));
    expect(Math.abs(levels(take).peak - TAKE_LEVEL.ceiling)).toBeLessThan(0.01);
    const plane = take.channels[0] ?? new Float32Array();
    const lead = Math.round(TAKE_PAD.lead * RATE);
    const quiet = Math.max(...plane.subarray(lead + RATE / 4, lead + RATE / 2).map(Math.abs));
    const loud = Math.max(...plane.map(Math.abs));
    // No limiter pressed the loud word down: it is still 18 times the rest.
    expect(loud / quiet).toBeGreaterThan(17.8);
  });

  test('a click after the line is trimmed with the silence around it', () => {
    const line = recording(0.5, 1, 0.5, 0.1);
    const click = recording(0, 0.005, 0.5, 0.8);
    const take = Option.getOrThrow(prepareTake(joined(line, click)));
    expect(secs(take)).toBeLessThan(1 + TAKE_PAD.lead + 0.011);
  });

  test('the take fades in and out, so neither trim clicks', () => {
    // Stops on a word: the last sample would be mid-wave.
    const take = Option.getOrThrow(prepareTake(recording(0.5, 1.0013, 0, 0.3)));
    const plane = take.channels[0] ?? new Float32Array();
    expect(plane[0]).toBe(0);
    expect(plane[take.frames - 1]).toBe(0);
    expect(Math.abs(plane[take.frames - 2] ?? 1)).toBeLessThan(0.01);
  });

  test('speech starts where the lead ends: nothing delays it', () => {
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
