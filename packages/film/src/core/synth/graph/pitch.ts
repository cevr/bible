// Pitches as Hz: a note name, equal-tempered on A4 = 440 Hz, and a degree of a
// sound's key. A note name is read whole, its octave every digit after its
// pitch class, and the names a sound may play are those of octaves 0 to 8
// (`NOTE_NAME`), which every schema that takes one checks.

import { Predicate } from 'effect';
import { exp2 } from './math.ts';
import type { Degree, Key, Pitch } from './nodes.ts';

/**
 * A note name a sound may play: a letter, an optional sharp or flat, and an
 * octave from 0 to 8 (C0 is 16.35 Hz, B8 7.9 kHz).
 */
export const NOTE_NAME = /^[A-G](#|b)?[0-8]$/;

/** Each letter's semitones above C. */
const LETTERS: ReadonlyMap<string, number> = new Map([
  ['C', 0],
  ['D', 2],
  ['E', 4],
  ['F', 5],
  ['G', 7],
  ['A', 9],
  ['B', 11],
]);

/** Each scale's steps above its tonic, in semitones. */
const STEPS: Readonly<Record<Key['scale'], ReadonlyArray<number>>> = {
  majorPentatonic: [0, 2, 4, 7, 9],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  minorPentatonic: [0, 3, 5, 7, 10],
};

/** A pitch class's semitones above C: its letter, then a sharp or a flat. */
const classOf = (name: string): number => {
  const accidental = name.charAt(1);
  return (
    (LETTERS.get(name.charAt(0)) ?? 0) + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0)
  );
};

/** Hz of a MIDI note number. */
const midiHz = (midi: number): number => 440 * exp2((midi - 69) / 12);

/** A degree's MIDI note number in `key`: its scale's step, an octave higher past the scale's top. */
const degreeMidi = (degree: Degree, key: Key): number => {
  const steps = STEPS[key.scale];
  const octaves = Math.floor(degree.degree / steps.length);
  const step = steps[degree.degree - octaves * steps.length] ?? 0;
  return 12 * (degree.octave + 1 + octaves) + classOf(key.tonic) + step;
};

/**
 * A note name's MIDI number (`D5` is 74), its octave read whole: `E10` is
 * 136, ten octaves over `E0`, never `E0`'s 16.
 */
export const noteMidi = (note: string): number =>
  12 * (Number(/\d+$/.exec(note)?.[0] ?? Number.NaN) + 1) + classOf(note);

/** A note name's frequency (`D5`, `F#3`, `Bb2`). */
const noteHz = (note: string): number => midiHz(noteMidi(note));

/** A pitch's frequency: Hz as written, a note by name, a degree in `key`. */
export const pitchHz = (pitch: Pitch, key: Key): number => {
  if (Predicate.isNumber(pitch)) return pitch;
  if (Predicate.isString(pitch)) return noteHz(pitch);
  return midiHz(degreeMidi(pitch, key));
};

/** Whether a pitch is a degree, which only a sound with a key can name. */
export const isDegree = (pitch: Pitch): pitch is Degree => Predicate.isObject(pitch);
