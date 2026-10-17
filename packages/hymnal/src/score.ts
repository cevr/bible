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
import type { Midi, Note, TimeSignature, Track } from './midi.js';

/** Where one verse is played, in ticks: from its first note to the next verse's first note. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

export interface Verses {
  /** Each verse's span; the intro is everything before the first. */
  readonly spans: readonly Span[];
  /** True when every verse's melody repeats the first exactly. */
  readonly exact: boolean;
}

export interface Score {
  readonly ticksPerBeat: number;
  /** Quarter-note beats in a bar: 3 for 3/4, 3 for 6/8. */
  readonly beatsPerBar: number;
  readonly meter: { readonly numerator: number; readonly denominator: number };
  /** Every meter from the tick it starts, the opening one at tick 0; bars count from each. */
  readonly meters: readonly TimeSignature[];
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

/**
 * The highest voice of a track: a note counts when it starts at or above
 * every note sounding then. Notes struck within `slack` ticks of each other
 * are one onset, as a unison part doubles each note a tick or two apart;
 * of two equal keys there, the shorter is the tune's (the other voice holds).
 */
const topVoice = (notes: readonly Note[], slack: number): Note[] => {
  const onsets: number[][] = [];
  for (const tick of [...new Set(notes.map((note) => note.start))].sort((a, b) => a - b)) {
    const last = onsets.at(-1);
    if (last !== undefined && tick - (last[0] ?? tick) <= slack) last.push(tick);
    else onsets.push([tick]);
  }
  const melody: Note[] = [];
  for (const ticks of onsets) {
    const tick = ticks[0] ?? 0;
    const starting = notes.filter((note) => ticks.includes(note.start));
    const highest = starting.reduce((a, b) =>
      b.key > a.key || (b.key === a.key && b.end - b.start < a.end - a.start) ? b : a,
    );
    const above = notes.some(
      (note) => note.start < tick && note.end > tick + slack && note.key > highest.key,
    );
    if (!above) melody.push(highest);
  }
  return melody;
};

const melodyOf = (midi: Midi, harmony: readonly Track[]): Note[] => {
  const first = midi.tracks.find((track) => track.notes.length > 0);
  const own = first !== undefined && !harmony.includes(first) ? first : harmony[0];
  return own === undefined ? [] : topVoice(own.notes, midi.ticksPerBeat / 16);
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
 * Splits the melody into an intro and `count` verses. Where the tune repeats
 * note for note, the verses are equal: `expected` (the text's verse count)
 * is tried first, then the most verses that repeat exactly. Otherwise a file
 * plays each verse in its own rhythm, a note split or joined for its words,
 * so the expected count's closest equal split only places each verse near
 * its start: the verse starts on the note nearby that opens as the first
 * verse does, after the longest pause (the end of a phrase).
 */
export const findVerses = (melody: readonly Note[], expected: number): Verses => {
  const keys = melody.map((note) => note.key);
  const end = melody.at(-1)?.end ?? 0;
  // The time from the note before to this one: a long note or a rest ends a phrase. The files
  // play an intro first, so the first note is no verse's start.
  const pause = (i: number) => {
    const [before, note] = [melody[i - 1], melody[i]];
    if (note === undefined) return Number.NEGATIVE_INFINITY;
    return before === undefined ? 0 : note.start - before.start;
  };
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
  const spans = (starts: readonly number[]): Verses['spans'] =>
    starts.map((i, k) => ({
      start: melody[i]?.start ?? end,
      end: melody[starts[k + 1] ?? melody.length]?.start ?? end,
    }));
  const equal = (count: number, intro: number, length: number) =>
    spans(Array.from({ length: count }, (_, k) => intro + k * length));

  const wanted = split(expected);
  if (wanted?.share === 1)
    return { spans: equal(expected, wanted.intro, wanted.length), exact: true };
  for (let count = 8; count >= 2; count--) {
    const found = count === expected ? undefined : split(count);
    if (found?.share === 1) return { spans: equal(count, found.intro, found.length), exact: true };
  }
  if (wanted === undefined) return { spans: [{ start: 0, end }], exact: false };

  const REACH = 4;
  const OPENING = 8;
  const nearby = (center: number, after: number) =>
    Array.from({ length: 2 * REACH + 1 }, (_, d) => center - REACH + d).filter(
      (i) => i > after && i < keys.length,
    );
  const best = (candidates: readonly number[], score: (i: number) => number, center: number) =>
    candidates.reduce((a, b) => {
      const [sa, sb] = [score(a), score(b)];
      return sb > sa || (sb === sa && Math.abs(b - center) < Math.abs(a - center)) ? b : a;
    }, candidates[0] ?? center);
  const first = best(nearby(wanted.intro, -1), pause, wanted.intro);
  // How many of the first verse's opening keys this note begins with, in a row.
  const opens = (i: number) => {
    let k = 0;
    while (k < OPENING && keys[i + k] !== undefined && keys[i + k] === keys[first + k]) k++;
    return k;
  };
  const starts = [first];
  for (let k = 1; k < expected; k++) {
    const center = (starts.at(-1) ?? first) + wanted.length;
    const after = starts.at(-1) ?? first;
    const ranked = (i: number) => opens(i) * end + Math.min(pause(i), end - 1);
    starts.push(best(nearby(center, after), ranked, center));
  }
  return { spans: spans(starts), exact: false };
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
    meters: [{ ...meter, tick: 0 }, ...midi.timeSignatures.slice(1)],
    key:
      signature === undefined
        ? closingKey(harmony)
        : Chord.keyFromSignature(signature.fifths, signature.minor),
    harmony,
    melody,
    verses: findVerses(melody, expectedVerses),
  };
};
