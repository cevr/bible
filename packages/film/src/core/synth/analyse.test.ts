import { describe, expect, test } from 'bun:test';
import type { Pcm } from '../audio.ts';
import { describeSound } from './analyse.ts';
import { loopSeam, seamHeard } from './seam.ts';
import { random } from './signal.ts';

const RATE = 44100;
const mono = (plane: Float32Array): Pcm => ({
  rate: RATE,
  frames: plane.length,
  channels: [plane],
});
const sine = (hz: number, secs: number) =>
  Float32Array.from(
    { length: Math.round(secs * RATE) },
    (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / RATE),
  );
const noise = (secs: number, seed: number) => {
  const r = random(seed);
  return Float32Array.from({ length: Math.round(secs * RATE) }, () => r() * 2 - 1);
};

describe('describeSound', () => {
  test('a tone is bright where it rings and not flat; noise is flat and bright', () => {
    const tone = describeSound(mono(sine(1000, 1)));
    expect(tone.centroid).toBeGreaterThan(900);
    expect(tone.centroid).toBeLessThan(1100);
    expect(tone.flatness).toBeLessThan(0.05);
    const hiss = describeSound(mono(noise(1, 1)));
    expect(hiss.flatness).toBeGreaterThan(0.5);
    expect(hiss.centroid).toBeGreaterThan(9000);
  });

  test('onset and end find the sound inside its silence', () => {
    const plane = new Float32Array(RATE * 2);
    plane.set(sine(440, 0.5), RATE / 2);
    const d = describeSound(mono(plane));
    expect(d.secs).toBe(2);
    expect(d.onset).toBeCloseTo(0.5, 1);
    expect(d.end).toBeCloseTo(1, 1);
  });
});

describe('loopSeam', () => {
  test('noise that loops is unheard at its seam; a fade out is heard', () => {
    const steady = noise(8, 2);
    expect(seamHeard(loopSeam(mono(steady)))).toBe(false);
    const fading = steady.map((v, i) => v * (1 - i / steady.length));
    expect(seamHeard(loopSeam(mono(fading)))).toBe(true);
  });

  test('a tone cut mid-cycle clicks at its seam', () => {
    const cut = sine(440, 7.3).map((v, i) => (i === 0 ? 0.5 : v));
    expect(loopSeam(mono(cut)).click).toBeGreaterThan(8);
  });
});
