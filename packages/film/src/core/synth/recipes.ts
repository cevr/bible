// Procedural sounds by recipe: the beds and tonal cues a film needs that are
// better made than generated (research: audio-design.md §1). A recipe is data
// (`Recipe`, a Schema union on `recipe`), and `synthesize(recipe, seed)` is a
// pure function of it: the same recipe and seed make the same samples, byte
// for byte, on every run, so a procedural sound is never stored, only
// rendered. Tonal recipes take their pitches from a root note and its major
// pentatonic scale, so a chime sits in the score's key; a variant's seed
// chooses its degree.

import { Schema } from 'effect';
import type { Pcm } from '../audio.ts';
import {
  SYNTH_RATE,
  type Random,
  addAt,
  attackDecay,
  brown,
  fadeEnds,
  filter,
  loopable,
  peakTo,
  pink,
  random,
  samples,
  envelop,
  sweep,
  white,
  wobble,
} from './signal.ts';

/** A pitch by note name: letter, optional sharp or flat, octave (`D5`, `F#3`, `Bb2`). */
export const Pitch = Schema.String.check(Schema.isPattern(/^[A-G](#|b)?[0-8]$/));
export type Pitch = typeof Pitch.Type;

const Secs = Schema.Finite.check(Schema.isGreaterThan(0));

export const Recipe = Schema.Union([
  /** Room tone: the quiet air of a paper room, made to loop. */
  Schema.Struct({ recipe: Schema.Literal('room'), secs: Secs }),
  /** A struck chime on a degree of the root's pentatonic scale, chosen by the seed. */
  Schema.Struct({
    recipe: Schema.Literal('bell'),
    root: Pitch,
    partials: Schema.Literals(['glass', 'bell']),
    secs: Secs,
  }),
  /** A low held tone on the root, its octave and fifth, made to loop. */
  Schema.Struct({ recipe: Schema.Literal('drone'), root: Pitch, secs: Secs }),
  /** A hollow tone falling from one note to another and fading. */
  Schema.Struct({ recipe: Schema.Literal('drain'), from: Pitch, to: Pitch, secs: Secs }),
  /** A soft swell: the root's chord entering note by note under a rising shimmer. */
  Schema.Struct({ recipe: Schema.Literal('bloom'), root: Pitch, secs: Secs }),
  /** A few bright plinks on the root's scale, jangling one after another. */
  Schema.Struct({
    recipe: Schema.Literal('notes'),
    root: Pitch,
    count: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 12 })),
    secs: Secs,
  }),
  /** Wind: gusting noise through a wandering band. */
  Schema.Struct({ recipe: Schema.Literal('wind'), secs: Secs }),
  /** Soft rain: a bed of hiss and seeded droplets, made to loop. */
  Schema.Struct({ recipe: Schema.Literal('rain'), secs: Secs }),
]);
export type Recipe = typeof Recipe.Type;

/** Each note letter's semitones above C. */
const SEMITONES = new Map([
  ['C', 0],
  ['D', 2],
  ['E', 4],
  ['F', 5],
  ['G', 7],
  ['A', 9],
  ['B', 11],
]);

/** A note's frequency in Hz, equal-tempered on A4 = 440. */
export const noteHz = (note: Pitch): number => {
  const letter = SEMITONES.get(note.charAt(0)) ?? 0;
  const accidental = note.includes('#') ? 1 : note.includes('b') ? -1 : 0;
  const octave = Number(note.charAt(note.length - 1));
  const midi = 12 * (octave + 1) + letter + accidental;
  return 440 * 2 ** ((midi - 69) / 12);
};

/** The major pentatonic scale's steps above its root, in semitones. */
const PENTATONIC = [0, 2, 4, 7, 9] as const;

/** Degree `degree` of the root's pentatonic scale (past the fifth, the next octave's). */
const degreeHz = (root: Pitch, degree: number): number => {
  const step = PENTATONIC[degree % PENTATONIC.length] ?? 0;
  const octave = Math.floor(degree / PENTATONIC.length);
  return noteHz(root) * 2 ** ((step + 12 * octave) / 12);
};

/** A struck partial: its ratio to the fundamental, its level and its decay (seconds). */
type Partial = readonly [ratio: number, level: number, decay: number];

const PARTIALS = {
  // A wine glass: nearly harmonic, long and pure.
  glass: [
    [1, 1, 1.3],
    [2.0, 0.28, 0.8],
    [3.01, 0.1, 0.45],
    [4.18, 0.05, 0.3],
  ],
  // A small bell: the inharmonic partials of a struck bar.
  bell: [
    [1, 1, 1.1],
    [2.0, 0.35, 0.7],
    [2.76, 0.25, 0.5],
    [5.4, 0.1, 0.25],
    [8.93, 0.04, 0.12],
  ],
} satisfies Record<'glass' | 'bell', ReadonlyArray<Partial>>;

/** One struck note at `hz`, `n` samples long, its partials' phases from `r`. */
const strike = (
  r: Random,
  hz: number,
  partials: ReadonlyArray<Partial>,
  n: number,
): Float32Array => {
  const out = new Float32Array(n);
  for (const [ratio, level, decay] of partials) {
    const phase = r() * Math.PI * 2;
    const f = hz * ratio;
    if (f >= SYNTH_RATE / 2) continue;
    for (let i = 0; i < n; i++) {
      const t = i / SYNTH_RATE;
      const env = Math.min(1, t / 0.006) * Math.exp(-t / decay);
      out[i] = (out[i] ?? 0) + level * Math.sin(2 * Math.PI * f * t + phase) * env;
    }
  }
  return out;
};

/** A sum of steady sines: `[hz, level]` pairs, `n` samples long. */
const tones = (r: Random, voices: ReadonlyArray<readonly [number, number]>, n: number) => {
  const out = new Float32Array(n);
  for (const [hz, level] of voices) {
    const phase = r() * Math.PI * 2;
    for (let i = 0; i < n; i++)
      out[i] = (out[i] ?? 0) + level * Math.sin((2 * Math.PI * hz * i) / SYNTH_RATE + phase);
  }
  return out;
};

const room = (r: Random, secs: number) => {
  const loop = 1;
  const n = samples(secs + loop);
  const air = wobble(r, n, 0.2);
  const body = filter(brown(r, n), 'lowPass', 300, 0.7);
  const hiss = filter(filter(pink(r, n), 'lowPass', 2500, 0.7), 'highPass', 180, 0.7);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++)
    out[i] = ((body[i] ?? 0) * 0.7 + (hiss[i] ?? 0) * 0.25) * (0.85 + 0.3 * air(i));
  return loopable(out, loop);
};

const bell = (r: Random, seed: number, recipe: Extract<Recipe, { recipe: 'bell' }>) => {
  // Variant n rings degree n - 1: five seeds, the five notes of the scale.
  const degree = (((seed - 1) % PENTATONIC.length) + PENTATONIC.length) % PENTATONIC.length;
  const n = samples(recipe.secs);
  return fadeEnds(strike(r, degreeHz(recipe.root, degree), PARTIALS[recipe.partials], n), 0.05);
};

const drone = (r: Random, recipe: Extract<Recipe, { recipe: 'drone' }>) => {
  const loop = 1;
  const n = samples(recipe.secs + loop);
  const hz = noteHz(recipe.root);
  const body = tones(
    r,
    [
      [hz, 1],
      [hz * 2, 0.35],
      [hz * 3, 0.12],
      [hz * 1.5, 0.18],
    ],
    n,
  );
  const breath = wobble(r, n, 0.15);
  return loopable(
    envelop(body, (i) => 0.8 + 0.2 * breath(i)),
    loop,
  );
};

const drain = (r: Random, recipe: Extract<Recipe, { recipe: 'drain' }>) => {
  const n = samples(recipe.secs);
  const from = noteHz(recipe.from);
  const to = noteHz(recipe.to);
  const hzAt = (i: number) => from * (to / from) ** (i / n);
  const out = new Float32Array(n);
  let phase = r() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    phase += (2 * Math.PI * hzAt(i)) / SYNTH_RATE;
    out[i] = Math.sin(phase) * 0.8 + Math.sin(phase * 2) * 0.15;
  }
  // The hollow: breath through a band that follows the pitch down.
  addAt(
    out,
    sweep(pink(r, n), 'bandPass', (i) => hzAt(i) * 2, 3),
    0,
    0.6,
  );
  return fadeEnds(
    envelop(out, (i) => Math.min(1, i / samples(0.03)) * (1 - i / n) ** 1.5),
    0.01,
  );
};

const bloom = (r: Random, recipe: Extract<Recipe, { recipe: 'bloom' }>) => {
  const n = samples(recipe.secs);
  const out = new Float32Array(n);
  // Root, third, fifth and octave, each entering a little after the last.
  for (const [k, degree] of [0, 2, 3, 5].entries()) {
    const at = samples(k * 0.09 + r() * 0.04);
    const note = strike(r, degreeHz(recipe.root, degree), PARTIALS.glass, n - at);
    addAt(
      out,
      envelop(note, (i) => Math.min(1, i / samples(0.25))),
      at,
      0.7 - k * 0.1,
    );
  }
  const shimmer = sweep(
    filter(pink(r, n), 'highPass', 1500, 0.7),
    'bandPass',
    (i) => 2000 + 4000 * (i / n),
    1.2,
  );
  addAt(
    out,
    envelop(shimmer, (i) => Math.sin(Math.PI * Math.min(1, i / n)) ** 2),
    0,
    0.25,
  );
  return fadeEnds(out, 0.05);
};

const notes = (r: Random, recipe: Extract<Recipe, { recipe: 'notes' }>) => {
  const n = samples(recipe.secs);
  const out = new Float32Array(n);
  const spread = recipe.secs * 0.7;
  for (let k = 0; k < recipe.count; k++) {
    const at = samples((spread * (k + r() * 0.6)) / recipe.count);
    const hz = degreeHz(recipe.root, Math.floor(r() * PENTATONIC.length * 2));
    const plink = strike(
      r,
      hz,
      PARTIALS.bell.map(([ratio, level, decay]) => [ratio, level, decay * 0.3] as const),
      n - at,
    );
    addAt(out, plink, at, 0.5 + r() * 0.5);
  }
  return fadeEnds(out, 0.05);
};

const wind = (r: Random, secs: number) => {
  const n = samples(secs);
  const gust = wobble(r, n, 0.35);
  const whistle = wobble(r, n, 0.8);
  const body = filter(brown(r, n), 'lowPass', 500, 0.7);
  const air = sweep(pink(r, n), 'bandPass', (i) => 350 + 900 * whistle(i), 2.2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++)
    out[i] = ((body[i] ?? 0) * 0.6 + (air[i] ?? 0) * 1.2) * (0.35 + 0.65 * gust(i));
  return fadeEnds(out, 0.5);
};

const rain = (r: Random, secs: number) => {
  const loop = 0.5;
  const n = samples(secs + loop);
  const out = filter(pink(r, n), 'highPass', 400, 0.7).map((v) => v * 0.25);
  const drop = (hz: number) =>
    envelop(filter(white(r, 300), 'bandPass', hz, 6), attackDecay(0.0005, 0.002));
  for (let i = 0; i < n; i++)
    if (r() < 0.004) addAt(out, drop(1500 + r() * 5000), i, 0.2 + r() * 0.8);
  return loopable(out, loop);
};

/** The recipe's samples before they are levelled. */
const raw = (recipe: Recipe, seed: number): Float32Array => {
  const r = random(seed);
  switch (recipe.recipe) {
    case 'room':
      return room(r, recipe.secs);
    case 'bell':
      return bell(r, seed, recipe);
    case 'drone':
      return drone(r, recipe);
    case 'drain':
      return drain(r, recipe);
    case 'bloom':
      return bloom(r, recipe);
    case 'notes':
      return notes(r, recipe);
    case 'wind':
      return wind(r, recipe.secs);
    case 'rain':
      return rain(r, recipe.secs);
  }
};

/** The peak every procedural sound is made at, in dBFS: the mix levels it by loudness after. */
export const SYNTH_PEAK = -1;

/**
 * `recipe` played with `seed`: one channel at `SYNTH_RATE`, its peak at
 * `SYNTH_PEAK`. The same recipe and seed always give the same samples.
 */
export const synthesize = (recipe: Recipe, seed: number): Pcm => {
  const plane = peakTo(raw(recipe, seed), SYNTH_PEAK);
  return { rate: SYNTH_RATE, frames: plane.length, channels: [plane] };
};
