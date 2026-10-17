/**
 * A hymn's MIDI file read as music: which tracks hold the harmony, the
 * melody, the meter and key, and where the intro ends and each verse begins.
 *
 * The hymnal's files play an intro (some bars of the tune) and then every
 * verse in full. The harmony is a keyboard part (program 5, else 4) on one
 * track per voice or one per pair of voices; a unison setting puts the
 * melody on its own track first.
 */

import * as Chord from './chord.js';
import type { Midi, Note, Track } from './midi.js';

export interface Verses {
  /** The tick the first verse starts on: the intro is everything before it. */
  readonly start: number;
  /** Each verse's length in ticks, the pause after it included. */
  readonly length: number;
  readonly count: number;
  /** True when every verse's melody repeats the first exactly. */
  readonly exact: boolean;
}

export interface Score {
  readonly ticksPerBeat: number;
  /** Quarter-note beats in a bar: 3 for 3/4, 3 for 6/8. */
  readonly beatsPerBar: number;
  readonly meter: { readonly numerator: number; readonly denominator: number };
  readonly key: Chord.Key;
  readonly harmony: readonly Note[];
  /** The tune's notes, one per sung note, start to end of the file. */
  readonly melody: readonly Note[];
  readonly verses: Verses;
}

const KEYBOARDS = [5, 4];

const harmonyTracks = (midi: Midi): readonly Track[] => {
  const sounding = midi.tracks.filter((track) => track.notes.length > 0);
  for (const program of KEYBOARDS) {
    const tracks = sounding.filter((track) => track.program === program);
    if (tracks.length > 0) return tracks.slice(0, 4);
  }
  return sounding.slice(0, 4);
};

/** The highest voice of a track: a note counts when it starts at or above every note sounding then. */
const topVoice = (notes: readonly Note[]): Note[] => {
  const melody: Note[] = [];
  const starts = [...new Set(notes.map((note) => note.start))];
  for (const tick of starts) {
    const starting = notes.filter((note) => note.start === tick);
    const highest = starting.reduce((a, b) => (b.key > a.key ? b : a));
    const above = notes.some(
      (note) => note.start < tick && note.end > tick && note.key > highest.key,
    );
    if (!above) melody.push(highest);
  }
  return melody;
};

const melodyOf = (midi: Midi, harmony: readonly Track[]): Note[] => {
  const first = midi.tracks.find((track) => track.notes.length > 0);
  const own = first !== undefined && !harmony.includes(first) ? first : harmony[0];
  return own === undefined ? [] : topVoice(own.notes);
};

/** The key the closing chord's bass names, for files with no key signature. */
const closingKey = (harmony: readonly Note[]): Chord.Key => {
  const end = Math.max(...harmony.map((note) => note.end));
  const last = harmony.filter((note) => note.end === end);
  const bass = Math.min(...last.map((note) => note.key)) % 12;
  const minor = last.some((note) => (note.key - bass + 12) % 12 === 3);
  const tonic = Chord.spell({ tonic: 'C', minor: false }, bass);
  return { tonic: tonic === 'Gb' ? 'F#' : tonic, minor };
};

/**
 * Splits the melody into an intro and `count` equal verses: the split whose
 * verses repeat note for note. `expected` (the text's verse count) is tried
 * first; failing it, the most verses that repeat exactly; failing that, the
 * expected count with the most notes in common.
 */
export const findVerses = (melody: readonly Note[], expected: number): Verses => {
  const keys = melody.map((note) => note.key);
  const split = (count: number) => {
    let best: { intro: number; length: number; share: number } | undefined;
    for (let intro = 0; intro <= keys.length / 2; intro++) {
      const length = (keys.length - intro) / count;
      if (!Number.isInteger(length) || length < 8) continue;
      let same = 0;
      for (let i = 0; i < length; i++) {
        const first = keys[intro + i];
        let all = true;
        for (let k = 1; k < count && all; k++) all = keys[intro + k * length + i] === first;
        if (all) same++;
      }
      const share = same / length;
      if (best === undefined || share > best.share) best = { intro, length, share };
      if (share === 1) break;
    }
    return best;
  };
  const toVerses = (count: number, found: { intro: number; length: number; share: number }) => {
    const start = melody[found.intro]?.start ?? 0;
    const next = melody[found.intro + found.length];
    const last = melody.at(-1);
    const length = next !== undefined ? next.start - start : (last?.end ?? start) - start;
    return { start, length, count, exact: found.share === 1 };
  };

  const wanted = split(expected);
  if (wanted?.share === 1) return toVerses(expected, wanted);
  for (let count = 8; count >= 2; count--) {
    const found = count === expected ? undefined : split(count);
    if (found?.share === 1) return toVerses(count, found);
  }
  if (wanted !== undefined) return toVerses(expected, wanted);
  const end = melody.at(-1)?.end ?? 0;
  return { start: 0, length: end, count: 1, exact: false };
};

/** Reads a hymn's file; `expectedVerses` is the number of verses its text has. */
export const fromMidi = (midi: Midi, expectedVerses: number): Score => {
  const tracks = harmonyTracks(midi);
  const harmony = tracks.flatMap((track) => track.notes).sort((a, b) => a.start - b.start);
  const melody = melodyOf(midi, tracks);
  const meter = midi.timeSignatures[0] ?? { numerator: 4, denominator: 4 };
  const signature = midi.keySignatures[0];
  return {
    ticksPerBeat: midi.ticksPerBeat,
    beatsPerBar: (meter.numerator * 4) / meter.denominator,
    meter: { numerator: meter.numerator, denominator: meter.denominator },
    key:
      signature === undefined
        ? closingKey(harmony)
        : Chord.keyFromSignature(signature.fifths, signature.minor),
    harmony,
    melody,
    verses: findVerses(melody, expectedVerses),
  };
};
