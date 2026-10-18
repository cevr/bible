/**
 * Chords as a hymn stores them: a root and an optional bass, each a degree
 * above the key's tonic in semitones, and a quality. A chord is spelled only
 * against a key, so transposing a hymn changes its key and nothing else.
 */

import { Schema } from 'effect';

/** Semitones above the tonic, 0..11. */
export const Degree = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 11 }));
export type Degree = typeof Degree.Type;

export const Quality = Schema.Literals([
  '',
  'm',
  '7',
  'm7',
  'maj7',
  '6',
  'm6',
  'dim',
  'dim7',
  'm7b5',
  'aug',
  'sus4',
  'sus2',
  '7sus4',
]);
export type Quality = typeof Quality.Type;

export const Chord = Schema.Struct({
  root: Degree,
  quality: Quality,
  bass: Schema.optional(Degree),
});
export type Chord = typeof Chord.Type;

type Table = ReadonlyArray<readonly [Quality, ReadonlyArray<number>]>;

/** Each quality's intervals above its root, in semitones, every note sounding. */
const COMPLETE: Table = [
  ['', [0, 4, 7]],
  ['m', [0, 3, 7]],
  ['7', [0, 4, 7, 10]],
  ['m7', [0, 3, 7, 10]],
  ['maj7', [0, 4, 7, 11]],
  ['6', [0, 4, 7, 9]],
  ['m6', [0, 3, 7, 9]],
  ['dim', [0, 3, 6]],
  ['dim7', [0, 3, 6, 9]],
  ['m7b5', [0, 3, 6, 10]],
  ['aug', [0, 4, 8]],
  ['sus4', [0, 5, 7]],
  ['sus2', [0, 2, 7]],
  ['7sus4', [0, 5, 7, 10]],
];

/** The complete chords, and those four voices sound with the fifth left out. */
const INTERVALS: Table = [
  ...COMPLETE,
  ['7', [0, 4, 10]],
  ['m7', [0, 3, 10]],
  ['', [0, 4]],
  ['m', [0, 3]],
  ['', [0, 7]],
];

const mod12 = (n: number) => ((n % 12) + 12) % 12;
const setKey = (pcs: Iterable<number>) => [...new Set(pcs)].sort((a, b) => a - b).join(',');

/**
 * Names the chord four voices sound: pitch classes (0 = C) and the lowest,
 * relative to a tonic. The bass is tried as the root first, so a chord in
 * root position is never read as an inversion of another. Sets no quality
 * matches, such as a passing tone against a held chord, are undefined.
 */
export const fromPitches = (
  pitchClasses: Iterable<number>,
  bass: number,
  tonic: number,
): Chord | undefined => named(pitchClasses, bass, tonic, INTERVALS);

const named = (
  pitchClasses: Iterable<number>,
  bass: number,
  tonic: number,
  table: Table,
): Chord | undefined => {
  const pcs = [...new Set([...pitchClasses].map(mod12))];
  const key = setKey(pcs);
  const roots = [mod12(bass), ...pcs.filter((pc) => pc !== mod12(bass))];
  for (const root of roots) {
    for (const [quality, intervals] of table) {
      if (setKey(intervals.map((i) => root + i).map(mod12)) !== key) continue;
      const chord: Chord = { root: mod12(root - tonic), quality };
      return root === mod12(bass) ? chord : { ...chord, bass: mod12(bass - tonic) };
    }
  }
  return undefined;
};

/**
 * Names a set of keys (MIDI note numbers) by the chord its notes above the
 * bass make, when that is a complete chord the bass is not in: the chord
 * over the bass (D-flat over E-flat). Undefined otherwise.
 */
export const overBass = (keys: readonly number[], tonic: number): Chord | undefined => {
  const bass = Math.min(...keys);
  const above = keys.filter((key) => key !== bass);
  const upper = [...new Set(above.map(mod12))];
  if (upper.length < 3 || upper.includes(mod12(bass))) return undefined;
  const chord = named(upper, Math.min(...above), tonic, COMPLETE);
  return chord === undefined
    ? undefined
    : { root: chord.root, quality: chord.quality, bass: mod12(bass - tonic) };
};

/**
 * Names a set of keys by the complete chord it makes with one note other
 * than the bass left out (a passing tone over a held chord), when exactly
 * one such chord exists; of several, the chord `sounding` before, when it is
 * one of them. Undefined otherwise.
 */
export const withoutOne = (
  keys: readonly number[],
  tonic: number,
  sounding: Chord | undefined,
): Chord | undefined => {
  const bass = Math.min(...keys);
  const pcs = [...new Set(keys.map(mod12))];
  const found: Chord[] = [];
  for (const left of pcs.filter((pc) => pc !== mod12(bass))) {
    const rest = pcs.filter((pc) => pc !== left);
    const chord = rest.length >= 3 ? named(rest, bass, tonic, COMPLETE) : undefined;
    if (chord !== undefined && !found.some((c) => equals(c, chord))) found.push(chord);
  }
  if (found.length === 1) return found[0];
  return sounding !== undefined && found.some((c) => equals(c, sounding)) ? sounding : undefined;
};

export const equals = (a: Chord, b: Chord): boolean =>
  a.root === b.root && a.quality === b.quality && a.bass === b.bass;

/**
 * The chord a guitarist plays for it: the bass note dropped, sixths and
 * major sevenths played as triads, and a diminished triad played as the
 * dominant seventh it stands in for (E dim over G in F is C7).
 */
export const simplify = (chord: Chord): Chord => {
  const { root, quality } = chord;
  switch (quality) {
    case 'dim':
      return { root: mod12(root - 4), quality: '7' };
    case 'maj7':
    case '6':
      return { root, quality: '' };
    case 'm6':
      return { root, quality: 'm' };
    default:
      return { root, quality };
  }
};

// ----------------------------------------------------------------------------
// Spelling
// ----------------------------------------------------------------------------

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const NATURAL = [0, 2, 4, 5, 7, 9, 11] as const;

/** A degree as letter steps above the tonic's letter: the names hymn keys use (b2, #4, b6, b7). */
const STEPS = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6] as const;

export const Key = Schema.Struct({
  /** The tonic's spelling, such as "Db" or "F#". */
  tonic: Schema.String.check(Schema.isPattern(/^[A-G](#|b)?$/)),
  minor: Schema.Boolean,
});
export type Key = typeof Key.Type;

const letterIndex = (name: string) => LETTERS.findIndex((letter) => letter === name[0]);

/** The pitch class of a spelled note: "Db" is 1. */
export const pitchClass = (name: string): number => {
  const natural = NATURAL[letterIndex(name)] ?? 0;
  const accidentals = [...name.slice(1)].reduce(
    (n, c) => n + (c === '#' ? 1 : c === 'b' ? -1 : 0),
    0,
  );
  return mod12(natural + accidentals);
};

/** Spells the note a degree above a key's tonic, by letter steps so each key keeps its own accidentals. */
export const spell = (key: Key, degree: number): string => {
  const step = STEPS[mod12(degree)] ?? 0;
  const letter = (letterIndex(key.tonic) + step) % 7;
  const target = mod12(pitchClass(key.tonic) + degree);
  const offset = mod12(target - (NATURAL[letter] ?? 0));
  const accidental = offset === 0 ? '' : offset <= 2 ? '#'.repeat(offset) : 'b'.repeat(12 - offset);
  return `${LETTERS[letter]}${accidental}`;
};

/** How each quality is written after its root. */
const SUFFIX: Record<Quality, string> = {
  '': '',
  m: 'm',
  '7': '7',
  m7: 'm7',
  maj7: 'maj7',
  '6': '6',
  m6: 'm6',
  dim: 'dim',
  dim7: 'dim7',
  m7b5: 'm7b5',
  aug: '+',
  sus4: 'sus4',
  sus2: 'sus2',
  '7sus4': '7sus4',
};

/** A chord's symbol in a key: "Gm7/Bb". */
export const format = (chord: Chord, key: Key): string => {
  const symbol = `${spell(key, chord.root)}${SUFFIX[chord.quality]}`;
  return chord.bass === undefined ? symbol : `${symbol}/${spell(key, chord.bass)}`;
};

/** The major keys from seven flats to seven sharps, by key signature. */
const MAJOR_BY_FIFTHS = [
  'Cb',
  'Gb',
  'Db',
  'Ab',
  'Eb',
  'Bb',
  'F',
  'C',
  'G',
  'D',
  'A',
  'E',
  'B',
  'F#',
  'C#',
];

/** The key a MIDI key signature names. */
export const keyFromSignature = (fifths: number, minor: boolean): Key => {
  const major = MAJOR_BY_FIFTHS[fifths + 7] ?? 'C';
  return minor
    ? { tonic: spell({ tonic: major, minor: false }, 9), minor }
    : { tonic: major, minor };
};
