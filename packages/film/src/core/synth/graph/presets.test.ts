// The eight recipes' ports (presets.ts), proved by measure against the
// recipes themselves (recipes.ts `synthesize`) on seeds 1–5, read as `film sfx
// compare` reads a sound: the same length, integrated loudness within 1 LU,
// the band balance within 1.5 dB RMS, each recipe's notes and partials at the
// recipe's levels (Goertzel), a one-shot's hit within the sync check's 20 ms,
// and a bed's loop seam heard on no more seeds than the recipe's and never a
// click. Each port is pinned too: its first seed's samples by digest, the
// same on every render. One test a preset and a measure, each short.

import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { Array as Arr, Result, Schema } from 'effect';
import type { Pcm } from '../../audio.ts';
import { distance, medianProfile, profileOf } from '../compare.ts';
import { type Recipe, synthesize } from '../recipes.ts';
import { resolveCode } from '../resolve.ts';
import { type SoundUse, defineLibrary } from '../../sfx.ts';
import { loopSeam, seamHeard } from '../seam.ts';
import { CodeSound } from './nodes.ts';
import type { ResolvedSound } from './plan.ts';
import { portOf } from './presets.ts';
import { renderCode } from './render.ts';

const SEEDS = [1, 2, 3, 4, 5] as const;

/**
 * Each recipe as the measures read it: short, so its test is quick, and long
 * enough that its draws even out (room's air sways at 0.2 Hz, the drone
 * breathes at 0.15 Hz and wind's whistle wanders at 0.8 Hz: shorter, five
 * seeds read a knot or two of each).
 */
const MEASURED = {
  room: { recipe: 'room', secs: 2 },
  bell: { recipe: 'bell', root: 'D5', partials: 'glass', secs: 0.6 },
  drone: { recipe: 'drone', root: 'D2', secs: 2 },
  drain: { recipe: 'drain', from: 'A4', to: 'D3', secs: 1 },
  bloom: { recipe: 'bloom', root: 'D4', secs: 1 },
  notes: { recipe: 'notes', root: 'D5', count: 3, secs: 1 },
  wind: { recipe: 'wind', secs: 3 },
  rain: { recipe: 'rain', secs: 1 },
} as const satisfies { readonly [R in Recipe['recipe']]: Extract<Recipe, { recipe: R }> };

/** How each recipe is heard: the ones made to loop are beds, read around their loop. */
const USE = {
  room: 'bed',
  bell: 'one-shot',
  drone: 'bed',
  drain: 'one-shot',
  bloom: 'one-shot',
  notes: 'one-shot',
  wind: 'one-shot',
  rain: 'bed',
} as const satisfies { readonly [R in Recipe['recipe']]: SoundUse };

/**
 * The beds as their seams are read: four seconds, so a slow sway of level
 * (the drone breathes at 0.15 Hz) is not all a seam can hear.
 */
const LOOPED: ReadonlyArray<Recipe> = [
  { recipe: 'room', secs: 4 },
  { recipe: 'drone', root: 'D2', secs: 4 },
  { recipe: 'rain', secs: 4 },
];

/** Each port's first seed at its measured settings, by the digest of its samples. */
const PINNED = {
  room: '56d2d52380c38159cddaa6e26047d2fc575370936dab386a23eb7e8e3e5a0b9d',
  bell: '7b571ea9a7078df59c03d71babe1c6099e488fff1708416d5e1e1df5dd071dbe',
  drone: '5a88d6d1c23ce6a5791d016a41316a0e76ba5c13c69b6a6965c3a3ea2ac2acb1',
  drain: '932e95671e6ac15783f49d7790459ed06f5ee8b11897506a3195fb44bfe9ebab',
  bloom: '0fbb94b9ff3e707082522dedaa5ef20367f2194f132dfb8c79564c48718f3076',
  notes: '6b0bf8a0ed51553a8aeae7cf793fd539df0b19957564fd3b00eeccf06e2d377f',
  wind: '7a099527d1fc519757cffa98e3e8cddefa88f731124cb826cfb5ec0699efd7fd',
  rain: 'd9ffe903ac19b54464f7bd0262abdbb85cbab6efa8660714a520c80c31384691',
} as const satisfies { readonly [R in Recipe['recipe']]: string };

/** A recipe's port as the library resolves it: the code trial of a procedural sound. */
const portSound = (recipe: Recipe): ResolvedSound => {
  const library = defineLibrary({
    'tone.port': { kind: 'procedural', recipe, variants: 5, use: 'one-shot' },
  });
  return Result.getOrThrow(resolveCode(library)).trials.get('tone.port')!.sound;
};

/** A recipe's renders on the seeds, and its port's. */
interface Renders {
  readonly recipe: Arr.NonEmptyReadonlyArray<Pcm>;
  readonly port: Arr.NonEmptyReadonlyArray<Pcm>;
}

/** Each recipe's renders, made once, when a test first reads them. */
const rendered = new Map<Recipe, Renders>();
const rendersOf = (recipe: Recipe): Renders => {
  const had = rendered.get(recipe);
  if (had !== undefined) return had;
  const sound = portSound(recipe);
  const made: Renders = {
    recipe: Arr.map(SEEDS, (seed) => synthesize(recipe, seed)),
    port: Arr.map(SEEDS, (seed) => renderCode(sound, seed)),
  };
  rendered.set(recipe, made);
  return made;
};

const digest = (pcm: Pcm): string => {
  const hash = createHash('sha256');
  for (const plane of pcm.channels)
    hash.update(new Uint8Array(plane.buffer, plane.byteOffset, plane.byteLength));
  return hash.digest('hex');
};

const median = (values: ReadonlyArray<number>): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

/** A MIDI note's frequency, on A4 = 440 Hz. */
const midiHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** The major pentatonic scale's steps above its root. */
const PENTATONIC = [0, 2, 4, 7, 9] as const;

/** The first `count` degrees of the pentatonic scale on `root` (a MIDI note), as MIDI notes. */
const degrees = (root: number, count: number): ReadonlyArray<number> =>
  Array.from({ length: count }, (_, k) => root + 12 * Math.floor(k / 5) + (PENTATONIC[k % 5] ?? 0));

/**
 * The share of `pcm`'s energy at `hz` in dB (Goertzel over the first
 * channel): −3 dB for a steady sine alone, lower as other sound shares it.
 */
const levelAt = (pcm: Pcm, hz: number): number => {
  const x = pcm.channels[0] ?? new Float32Array(0);
  const c = 2 * Math.cos((2 * Math.PI * hz) / pcm.rate);
  let s1 = 0;
  let s2 = 0;
  let energy = 0;
  for (const v of x) {
    const s0 = v + c * s1 - s2;
    s2 = s1;
    s1 = s0;
    energy += v * v;
  }
  const power = s1 * s1 + s2 * s2 - c * s1 * s2;
  return 10 * Math.log10(Math.max(power / (x.length * energy), 1e-30));
};

/** The median over the seeds of each side's level at `hz`. */
const levelsAt = (renders: Renders, hz: number) => ({
  recipe: median(renders.recipe.map((pcm) => levelAt(pcm, hz))),
  port: median(renders.port.map((pcm) => levelAt(pcm, hz))),
});

/** What every port shares with its recipe: its length, its loudness and, but for a melody, its band balance. */
const measuresAsItsRecipe = (recipe: Recipe, balanced: boolean) => {
  const renders = rendersOf(recipe);
  for (const [port, synth] of Arr.zip(renders.port, renders.recipe))
    expect(port.frames).toBe(synth.frames);
  const profiled = (pcm: Pcm) => profileOf(pcm, USE[recipe.recipe]);
  const recipeProfile = medianProfile(Arr.map(renders.recipe, profiled));
  const portProfile = medianProfile(Arr.map(renders.port, profiled));
  expect(Math.abs(portProfile.integrated - recipeProfile.integrated)).toBeLessThanOrEqual(1);
  const apart = distance(recipeProfile, portProfile);
  if (balanced) expect(apart.balance).toBeLessThanOrEqual(1.5);
  return { renders, apart };
};

describe('each port is pinned', () => {
  for (const recipe of Object.values(MEASURED))
    test(`${recipe.recipe}: decodes as a code sound, and renders byte for byte as pinned`, () => {
      const sound = { play: portOf(recipe) };
      expect(Schema.decodeSync(CodeSound)(sound)).toEqual(sound);
      const once = digest(Arr.headNonEmpty(rendersOf(recipe).port));
      expect(digest(renderCode(portSound(recipe), 1))).toBe(once);
      expect(once).toBe(PINNED[recipe.recipe]);
    });
});

describe('each port measures as its recipe on seeds 1–5', () => {
  test('room: its length, loudness and band balance', () => {
    measuresAsItsRecipe(MEASURED.room, true);
  });

  test('bell: each seed strikes its own degree, each partial at the recipe’s level, the hit on time', () => {
    const { renders, apart } = measuresAsItsRecipe(MEASURED.bell, true);
    const scale = degrees(74, 5);
    /** The degree whose note is the loudest in `pcm`. */
    const loudest = (pcm: Pcm) => {
      const levels = scale.map((midi) => levelAt(pcm, midiHz(midi)));
      return levels.indexOf(Math.max(...levels));
    };
    for (const [seed, [port, synth]] of Arr.zip(SEEDS, Arr.zip(renders.port, renders.recipe))) {
      // Variant n rings degree n − 1.
      expect(loudest(port)).toBe(seed - 1);
      expect(loudest(synth)).toBe(seed - 1);
      const struck = midiHz(scale[seed - 1] ?? 0);
      for (const ratio of [1, 2, 3.01, 4.18])
        expect(
          Math.abs(levelAt(port, struck * ratio) - levelAt(synth, struck * ratio)),
        ).toBeLessThanOrEqual(1.5);
    }
    expect(Math.abs(apart.hit)).toBeLessThanOrEqual(0.02);
  });

  test('drone: its four voices at the recipe’s levels', () => {
    const { renders } = measuresAsItsRecipe(MEASURED.drone, true);
    for (const ratio of [1, 2, 3, 1.5]) {
      const { recipe, port } = levelsAt(renders, midiHz(38) * ratio);
      expect(Math.abs(port - recipe)).toBeLessThanOrEqual(1.5);
    }
  });

  test('drain: its band balance, and its hit on time', () => {
    const { apart } = measuresAsItsRecipe(MEASURED.drain, true);
    expect(Math.abs(apart.hit)).toBeLessThanOrEqual(0.02);
  });

  test('bloom: its chord’s notes at the recipe’s levels', () => {
    const { renders } = measuresAsItsRecipe(MEASURED.bloom, true);
    // The root, third and fifth (D4, F#4, A4). The octave shares its
    // frequency with the root's second partial, so its level rides on two
    // random phases in both and is read by the balance alone.
    for (const midi of [62, 66, 69]) {
      const { recipe, port } = levelsAt(renders, midiHz(midi));
      expect(Math.abs(port - recipe)).toBeLessThanOrEqual(1.5);
    }
  });

  test('notes: every plink on the scale, 20 dB over any note off it', () => {
    // A melody drawn anew each seed, in both: its band balance is the
    // melody's, so it is read by the scale its plinks keep to.
    const { renders } = measuresAsItsRecipe(MEASURED.notes, false);
    const on = degrees(74, 10);
    const off = Array.from({ length: 24 }, (_, k) => 74 + k).filter((m) => !on.includes(m));
    const gap = (pcm: Pcm) =>
      Math.max(...on.map((m) => levelAt(pcm, midiHz(m)))) -
      Math.max(...off.map((m) => levelAt(pcm, midiHz(m))));
    for (const pcm of [...renders.port, ...renders.recipe]) expect(gap(pcm)).toBeGreaterThan(20);
  });

  test('wind: its length, loudness and band balance', () => {
    measuresAsItsRecipe(MEASURED.wind, true);
  });

  test('rain: its length, loudness and band balance', () => {
    measuresAsItsRecipe(MEASURED.rain, true);
  });
});

describe('each bed’s port loops as its recipe', () => {
  for (const recipe of LOOPED)
    test(`${recipe.recipe}: its seam heard on no more seeds than the recipe's, and never a click`, () => {
      const sound = portSound(recipe);
      const port = SEEDS.map((seed) => loopSeam(renderCode(sound, seed)));
      const heard = (seams: ReadonlyArray<ReturnType<typeof loopSeam>>) =>
        seams.filter(seamHeard).length;
      expect(heard(port)).toBeLessThanOrEqual(
        heard(SEEDS.map((seed) => loopSeam(synthesize(recipe, seed)))),
      );
      for (const seam of port) expect(seamHeard({ db: 0, click: seam.click })).toBe(false);
    });
});
