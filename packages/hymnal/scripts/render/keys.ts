/**
 * A hymn in another key: the style's stems moved `transpose` semitones, and
 * each stem that would then sound a note its sampler has no sample for moved
 * an octave as a whole, so the sampler drops no note in silence. Only the
 * keys move: the stems keep the hymn's ticks, its tempo map and its
 * velocities, so the words' timings hold in every key. Pure.
 *
 * The printed key (`transpose` 0) is the style unchanged: `warm-1` byte for
 * byte.
 */

import type { Voices } from '../../src/voices.js';
import { type Part, PIANO_SFZ, type Stem, type Style } from './style.js';

/** The keys a sampler has samples for, lowest and highest. */
export type Range = NonNullable<Stem['range']>;

/**
 * Each instrument's sampled keys, by its SFZ file: every key from `low` to
 * `high` falls in one of its regions (`keys.slow.test.ts` reads the SFZ
 * files of the instrument cache and holds this table to them).
 */
export const SAMPLED = new Map<string, Range>([
  [PIANO_SFZ, { low: 21, high: 108 }],
  ['vsco/ViolinEnsSusVib.sfz', { low: 55, high: 86 }],
  ['vsco/ViolaEnsSusVib.sfz', { low: 48, high: 86 }],
  ['vsco/CelloEnsSusVib.sfz', { low: 36, high: 77 }],
  ['vsco/ContrabassSusNV.sfz', { low: 24, high: 60 }],
]);

/** A stem a key moved off its plain transpose: by `octave` semitones as a whole, with `folded` notes still wider than its instrument. */
export interface Move {
  readonly stem: string;
  readonly octave: number;
  readonly folded: number;
}

const PARTS: ReadonlyArray<Part> = ['S', 'A', 'T', 'B'];

/** The octave moves tried, in order: none, down, up. */
const OCTAVES = [0, -12, 12] as const;

const outside = (keys: ReadonlyArray<number>, shift: number, range: Range) =>
  keys.filter((key) => key + shift < range.low || key + shift > range.high).length;

/** A stem moved `transpose` semitones for this hymn's parts, and its move when it is more than that. */
const keyedStem = (stem: Stem, parts: Voices, transpose: number) => {
  const range = SAMPLED.get(stem.sfz);
  if (range === undefined) throw new Error(`no sampled range for ${stem.sfz}`);
  const keys = PARTS.flatMap((part) =>
    stem.parts[part] === undefined
      ? []
      : parts[part].map((n) => n.key + stem.transpose + transpose),
  );
  // The first octave that puts every note in range; else the one that leaves the fewest out.
  const octave = OCTAVES.reduce((best, shift) =>
    outside(keys, shift, range) < outside(keys, best, range) ? shift : best,
  );
  const folded = outside(keys, octave, range);
  const keyed: Stem = { ...stem, transpose: stem.transpose + transpose + octave, range };
  const move: ReadonlyArray<Move> =
    octave === 0 && folded === 0 ? [] : [{ stem: stem.name, octave, folded }];
  return { keyed, move };
};

/** A style in another key, and each stem it moved more than the key. */
export interface Keyed<S extends Style> {
  readonly style: S;
  readonly moves: ReadonlyArray<Move>;
}

/**
 * `style` moved `transpose` semitones for a hymn whose parts are `parts`:
 * each stem's notes move `transpose`, then the stem moves by the first of no
 * octave, one down or one up that keeps every note in its instrument's
 * range. A part wider than its instrument takes the octave that leaves the
 * fewest notes out, and each of those folds by octaves into the range
 * (`stems.ts`). `moves` names each stem that moved more than `transpose`.
 */
export const keyedStyle = <S extends Style>(
  style: S,
  parts: Voices,
  transpose: number,
): Keyed<S> => {
  if (transpose === 0) return { style, moves: [] };
  const stems = style.stems.map((stem) => keyedStem(stem, parts, transpose));
  return {
    style: { ...style, stems: stems.map((s) => s.keyed) },
    moves: stems.flatMap((s) => s.move),
  };
};

/** A move as the run says it: `bass -12`, `violas +12 folded 3`. */
export const moveText = (move: Move) =>
  `${move.stem} ${move.octave > 0 ? '+' : ''}${move.octave}${move.folded > 0 ? ` folded ${move.folded}` : ''}`;
