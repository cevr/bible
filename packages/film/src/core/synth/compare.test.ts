// A render's profile and two sides' distance, on sounds whose answer is known:
// a tone's power in its own band, rumble below 30 Hz, a copy at no distance,
// a low-pass that moves the high bands down, a delay that moves only the hit.

import { describe, expect, test } from 'bun:test';
import type { Pcm } from '../audio.ts';
import { distance, medianProfile, profileOf, type Profile } from './compare.ts';
import { random } from './signal.ts';

const RATE = 44100;
const pcmOf = (...channels: ReadonlyArray<Float32Array>): Pcm => ({
  rate: RATE,
  frames: channels[0]?.length ?? 0,
  channels,
});
const sine = (hz: number, secs: number) =>
  Float32Array.from(
    { length: Math.round(secs * RATE) },
    (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / RATE),
  );
const noise = (secs: number, seed: number) => {
  const r = random(seed);
  return Float32Array.from({ length: Math.round(secs * RATE) }, () => (r() * 2 - 1) * 0.5);
};
/** `plane` through a one-pole low-pass at `hz`. */
const lowPassed = (plane: Float32Array, hz: number) => {
  const a = Math.exp((-2 * Math.PI * hz) / RATE);
  let y = 0;
  return plane.map((x) => {
    y = (1 - a) * x + a * y;
    return y;
  });
};
/** A band's share, by its index (0 is 31.5 Hz, 15 is 1 kHz, 24 is 8 kHz). */
const band = (profile: Profile, k: number) => profile.bands[k] ?? 0;

describe('profileOf', () => {
  test("a tone's power is in its own band, and none of it is rumble", () => {
    const tone = profileOf(pcmOf(sine(1000, 1)));
    expect(band(tone, 15)).toBeGreaterThan(0.99);
    expect(tone.rumble).toBeLessThan(1e-6);
    expect(tone.bands.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
    expect(tone.secs).toBe(1);
    expect(tone.integrated).toBeLessThan(0);
  });

  test('a 25 Hz tone is rumble: most of its power is below 30 Hz', () => {
    expect(profileOf(pcmOf(sine(25, 1))).rumble).toBeGreaterThan(0.6);
  });

  test('the bands are read over every channel: a tone in each is half of the power each', () => {
    const both = profileOf(pcmOf(sine(1000, 1), sine(100, 1)));
    expect(band(both, 15)).toBeCloseTo(0.5, 1);
    expect(band(both, 5)).toBeCloseTo(0.5, 1);
  });

  test('a burst rings from its hit to its tail', () => {
    const plane = new Float32Array(RATE);
    plane.set(sine(440, 0.3), Math.round(RATE * 0.2));
    const burst = profileOf(pcmOf(plane));
    expect(burst.onset).toBeCloseTo(0.2, 1);
    expect(burst.tail).toBeGreaterThan(0.25);
    expect(burst.tail).toBeLessThan(0.35);
  });

  test('silence has no share in any band', () => {
    const quiet = profileOf(pcmOf(new Float32Array(RATE)));
    expect(quiet.bands.every((share) => share === 0)).toBe(true);
    expect(quiet.rumble).toBe(0);
    expect(distance(quiet, quiet)).toEqual({ bands: [], balance: 0, apart: [], hit: 0 });
  });
});

describe('medianProfile', () => {
  test('each number is the median of its renders, the mean of the middle two for an even count', () => {
    const at = (secs: number) => profileOf(pcmOf(noise(secs, Math.round(secs * 10))));
    const [one, two, three] = [at(0.5), at(1.5), at(1)];
    expect(medianProfile([one, two, three]).secs).toBe(1);
    expect(medianProfile([one, two]).secs).toBe(1);
    const middle = medianProfile([one, two, three]).bands;
    expect(middle[15]).toBeCloseTo(
      [band(one, 15), band(two, 15), band(three, 15)].sort((a, b) => a - b)[1] ?? 0,
      12,
    );
  });
});

describe('distance', () => {
  test('a sound stands at no distance from itself', () => {
    const hiss = profileOf(pcmOf(noise(1, 3)));
    const self = distance(hiss, hiss);
    expect(self.balance).toBe(0);
    expect(self.apart).toEqual([]);
    expect(self.hit).toBe(0);
    expect(self.bands.length).toBeGreaterThan(20);
  });

  test('a low-pass moves the high bands down against the low, and names those that moved over 6 dB', () => {
    const hiss = noise(1, 4);
    const away = distance(profileOf(pcmOf(hiss)), profileOf(pcmOf(lowPassed(hiss, 500))));
    const moved = (name: string) => away.bands.find((row) => row.band === name)?.moved ?? 0;
    // Shares: the power the filter takes off the top is a larger share left at the bottom.
    expect(moved('8 kHz') - moved('100 Hz')).toBeLessThan(-20);
    expect(Math.abs(moved('63 Hz') - moved('100 Hz'))).toBeLessThan(1);
    expect(moved('100 Hz')).toBeGreaterThan(0);
    expect(away.apart.map((row) => row.band)).toContain('8 kHz');
    expect(away.balance).toBeGreaterThan(6);
  });

  test('a delay moves the hit, and the balance barely', () => {
    const burst = sine(440, 0.2).map((v, i) => v * Math.exp(-i / 2000));
    const early = new Float32Array(RATE);
    const late = new Float32Array(RATE);
    early.set(burst, Math.round(RATE * 0.1));
    late.set(burst, Math.round(RATE * 0.2));
    const moved = distance(profileOf(pcmOf(early)), profileOf(pcmOf(late)));
    expect(moved.hit).toBeCloseTo(0.1, 2);
    expect(moved.balance).toBeLessThan(0.5);
  });
});
