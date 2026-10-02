import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import type { Pcm } from '../audio.ts';
import { loudness } from './loudness.ts';
import { type Recipe, SYNTH_PEAK, noteHz, synthesize } from './recipes.ts';
import { SYNTH_RATE } from './signal.ts';

const plane = (pcm: Pcm) => pcm.channels[0] ?? new Float32Array();
const digest = (pcm: Pcm) =>
  createHash('sha256')
    .update(new Uint8Array(plane(pcm).buffer))
    .digest('hex');

/** Power at `hz` over `x` (Goertzel), for telling which note rang. */
const powerAt = (x: Float32Array, hz: number) => {
  const k = (2 * Math.PI * hz) / SYNTH_RATE;
  const coefficient = 2 * Math.cos(k);
  let s1 = 0;
  let s2 = 0;
  for (const v of x) {
    const s = v + coefficient * s1 - s2;
    s2 = s1;
    s1 = s;
  }
  return s1 * s1 + s2 * s2 - coefficient * s1 * s2;
};

const EVERY: ReadonlyArray<Recipe> = [
  { recipe: 'room', secs: 4 },
  { recipe: 'bell', root: 'D5', partials: 'glass', secs: 2 },
  { recipe: 'drone', root: 'D2', secs: 4 },
  { recipe: 'drain', from: 'A3', to: 'D2', secs: 1.5 },
  { recipe: 'bloom', root: 'D4', secs: 2 },
  { recipe: 'notes', root: 'D5', count: 5, secs: 1.5 },
  { recipe: 'wind', secs: 3 },
  { recipe: 'rain', secs: 3 },
];

describe('noteHz', () => {
  test('equal temperament on A4 = 440', () => {
    expect(noteHz('A4')).toBeCloseTo(440, 6);
    expect(noteHz('D5')).toBeCloseTo(587.33, 2);
    expect(noteHz('C4')).toBeCloseTo(261.63, 2);
    expect(noteHz('F#3')).toBeCloseTo(185.0, 1);
    expect(noteHz('Bb2')).toBeCloseTo(116.54, 2);
  });
});

describe('synthesize', () => {
  for (const recipe of EVERY)
    test(`${recipe.recipe}: the same seed makes the same samples, another seed others`, () => {
      const once = synthesize(recipe, 3);
      expect(digest(synthesize(recipe, 3))).toBe(digest(once));
      expect(digest(synthesize(recipe, 4))).not.toBe(digest(once));
      expect(once.rate).toBe(SYNTH_RATE);
      expect(once.frames).toBe(Math.round(recipe.secs * SYNTH_RATE));
      expect(loudness(once).peak).toBeCloseTo(SYNTH_PEAK, 3);
    });

  test('a bell rings the scale degree its seed names: seeds 1–5 are the five notes', () => {
    const scale = [0, 2, 4, 7, 9].map((st) => noteHz('D5') * 2 ** (st / 12));
    for (const [i, hz] of scale.entries()) {
      const rung = plane(
        synthesize({ recipe: 'bell', root: 'D5', partials: 'glass', secs: 1 }, i + 1),
      );
      const loudest = scale.reduce((best, f) =>
        powerAt(rung, f) > powerAt(rung, best) ? f : best,
      );
      expect(loudest).toBe(hz);
    }
  });

  test('a looping bed runs on from its end into its start without a jump', () => {
    for (const recipe of EVERY.filter((r) => ['room', 'drone', 'rain'].includes(r.recipe))) {
      const x = plane(synthesize(recipe, 1));
      let steps = 0;
      for (let i = 1; i < x.length; i++) steps += Math.abs((x[i] ?? 0) - (x[i - 1] ?? 0));
      const typical = steps / (x.length - 1);
      const seam = Math.abs((x[0] ?? 0) - (x[x.length - 1] ?? 0));
      expect(seam).toBeLessThan(typical * 8);
    }
  });

  test('the drain falls: more low than high at its end, the reverse at its start', () => {
    const x = plane(synthesize({ recipe: 'drain', from: 'A3', to: 'D2', secs: 1.5 }, 1));
    const head = x.subarray(0, SYNTH_RATE * 0.3);
    const tail = x.subarray(x.length - SYNTH_RATE * 0.5);
    expect(powerAt(head, noteHz('A3'))).toBeGreaterThan(powerAt(head, noteHz('D2')));
    expect(powerAt(tail, noteHz('D2') * 1.1)).toBeGreaterThan(powerAt(tail, noteHz('A3')));
  });
});
