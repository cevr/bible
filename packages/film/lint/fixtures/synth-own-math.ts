// Fixture for film/synth-own-math: each line marked RED fires the rule, and
// nothing else does.

import { Match, Predicate, Schema } from 'effect';
import { Option } from 'effect'; // RED film/synth-own-math
import * as Effect from 'effect'; // RED film/synth-own-math
import { rng } from '../../src/core/random.ts';
import { exp, sinTurn } from '../../src/core/synth/graph/math.ts';
import type { Pcm } from '../../src/core/audio.ts';
import { type Recipe } from '../../src/core/synth/recipes.ts';
import { synthesize } from '../../src/core/synth/recipes.ts'; // RED film/synth-own-math
import { loudness, type Loudness } from '../../src/core/synth/loudness.ts'; // RED film/synth-own-math
import '../../src/core/dsp.ts'; // RED film/synth-own-math
export { SYNTH_RATE } from '../../src/core/synth/graph/units.ts';
export type { Pcm as Audio } from '../../src/core/audio.ts';
export { type Key } from '../../src/core/time.ts';
export { lerp } from '../../src/core/time.ts'; // RED film/synth-own-math
export * from '../../src/core/dsp.ts'; // RED film/synth-own-math

declare const x: number;
declare const name: 'sin';

// Exact on every host: rounding, sign, comparison, sqrt and the constants, by name.
export const exact = [Math.floor(x), Math.round(x), Math.abs(x), Math.min(x, 1), Math.max(x, 0)];
export const more = [Math.sqrt(x), Math.fround(x), Math.sign(x), Math.trunc(x), Math['ceil'](x)];
export const constants = [Math.PI, Math.LN2, Math.SQRT2];
export const own = [sinTurn(x), exp(x), rng(1)(), Predicate.isNumber, Schema.Number, Match.type];

export const sine = Math.sin(x); // RED film/synth-own-math
export const power = Math.pow(x, 2); // RED film/synth-own-math
export const grown = Math.exp(x); // RED film/synth-own-math
export const noise = Math.random(); // RED film/synth-own-math
export const computed = Math[name](x); // RED film/synth-own-math
export const handed = Math; // RED film/synth-own-math
export const { tanh } = Math; // RED film/synth-own-math
export const held = globalThis.Math.floor(x); // RED film/synth-own-math
export const squared = x ** 2; // RED film/synth-own-math
export const cubed = (y: number) => {
  let z = y;
  z **= 3; // RED film/synth-own-math
  return z;
};
export const later = () => import('../../src/core/synth/recipes.ts'); // RED film/synth-own-math

// A local named Math is its own binding; a key named Math reads nothing.
export const shadowed = (Math: { readonly sin: (v: number) => number }) => Math.sin(x);
export const keyed = { Math: 1 }.Math;

export const used = [Option, Effect, synthesize, loudness];
export type Used = Pcm | Recipe | Loudness;
