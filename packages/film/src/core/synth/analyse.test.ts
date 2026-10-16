import { describe, expect, test } from 'bun:test';
import type { Pcm } from '../audio.ts';
import { rng } from '../random.ts';
import { describeSound } from './analyse.ts';
import { loopSeam, seamHeard } from './seam.ts';

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
  const r = rng(seed);
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

  test('a click brightens the sound alike at its very start and in its middle', () => {
    // A 3 ms click of 4 kHz over a soft 100 Hz hum, half a second long.
    const centroid = (at: number) => {
      const plane = sine(100, 0.5).map((v) => v * 0.05);
      plane.set(sine(4000, 0.003), Math.round(at * RATE));
      return describeSound(mono(plane)).centroid;
    };
    const middle = centroid(0.25);
    expect(middle).toBeGreaterThan(1000);
    expect(Math.abs(centroid(0) / middle - 1)).toBeLessThan(0.05);
  });

  test('the hit is where the sound is loudest, however soft its lead-in', () => {
    const plane = new Float32Array(RATE * 2);
    // A soft swell from 0.2 s, then a hit at 1.3 s.
    plane.set(
      sine(440, 1.1).map((v) => v * 0.1),
      Math.round(RATE * 0.2),
    );
    plane.set(sine(440, 0.1), Math.round(RATE * 1.3));
    const d = describeSound(mono(plane));
    expect(d.onset).toBeCloseTo(0.2, 1);
    expect(d.hit).toBeCloseTo(1.3, 1);
  });

  test('a knock over a soft hiss stands out as a hit; a swell and a steady hiss do not', () => {
    // A 30 ms knock 26 dB over a hiss, at 0.5 s.
    const hiss = noise(1, 2).map((v) => v * 0.05);
    const knocked = hiss.slice();
    knocked.set(
      sine(600, 0.03).map((v, i) => v * Math.exp(-i / 400)),
      Math.round(RATE * 0.5),
    );
    expect(describeSound(mono(knocked)).stands).toBeGreaterThan(10);
    expect(describeSound(mono(hiss)).stands).toBeLessThan(1);
    // Noise swelling up over 0.6 s and down over 0.6 s: loudest in its middle,
    // and nowhere a hit.
    const swell = noise(1.2, 3).map((v, i) => v * Math.sin((Math.PI * i) / (1.2 * RATE)));
    expect(describeSound(mono(swell)).stands).toBeLessThan(1);
  });

  test('a click alone in its file stands over the silence past its ends', () => {
    expect(describeSound(mono(sine(1000, 0.01))).stands).toBeGreaterThan(60);
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
