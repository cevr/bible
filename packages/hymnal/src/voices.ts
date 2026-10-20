/**
 * A hymn's four parts as the recordings play them, read from its MIDI file
 * through the score's own reading (`score.ts`): S the melody, B the bass,
 * A and T the inner voices.
 *
 * - S is the melody: the top voice of the tune's own track (the first
 *   sounding track when it is not a harmony track, else the first harmony
 *   track).
 * - B is the bottom voice of the last harmony track.
 * - A is every other note of the upper half of the harmony tracks, T every
 *   other note of the lower half. With more than two tracks the upper half is
 *   the first `(n + 1) / 2` (rounded down); with one or two it is the first.
 * - A note of A that doubles the melody (a unison setting) is dropped.
 *
 * Notes struck within a 64th (`ticksPerBeat / 16`) of each other are one
 * onset, as in `score.ts`. The file's own arrangement tracks (strings, bass,
 * winds) play no part.
 */

import type { Midi, Note } from './midi.js';
import { harmonyTracks, melodyOf, topVoice } from './score.js';

export interface Voices {
  /** The melody, in onset order. */
  readonly S: readonly Note[];
  /** The upper inner voice, by start, end and key. */
  readonly A: readonly Note[];
  /** The lower inner voice, by start, end and key. */
  readonly T: readonly Note[];
  /** The bass, in onset order. */
  readonly B: readonly Note[];
}

/** The lowest voice of `notes`: the top voice of the notes turned upside down. */
const bottomVoice = (notes: readonly Note[], slack: number): Note[] =>
  topVoice(
    notes.map((note) => ({ ...note, key: -note.key })),
    slack,
  ).map((note) => ({ ...note, key: -note.key }));

const onsetKey = (note: Note) => `${note.start}:${note.key}`;
const noteKey = (note: Note) => `${note.start}:${note.end}:${note.key}`;

const byStartEndKey = (a: Note, b: Note) => a.start - b.start || a.end - b.end || a.key - b.key;

export const voices = (midi: Midi): Voices => {
  const harmony = harmonyTracks(midi);
  const last = harmony.at(-1);
  if (last === undefined) return { S: [], A: [], T: [], B: [] };
  const first = midi.tracks.find((track) => track.notes.length > 0);
  // The tune's own track, as `melodyOf` chooses it.
  const own = first !== undefined && !harmony.includes(first) ? first : harmony[0];
  const melody = melodyOf(midi, harmony);
  const sung = new Set(melody.map(onsetKey));
  const bass = bottomVoice(last.notes, midi.ticksPerBeat / 16);
  const bassNotes = new Set(bass.map(noteKey));
  const half = harmony.length > 2 ? Math.floor((harmony.length + 1) / 2) : 1;
  const upper: Note[] = [];
  const lower: Note[] = [];
  for (const [i, track] of harmony.entries()) {
    for (const note of track.notes) {
      if (track === own && sung.has(onsetKey(note))) continue;
      if (track === last && bassNotes.has(noteKey(note))) continue;
      (i < half ? upper : lower).push(note);
    }
  }
  return {
    S: melody,
    A: upper.filter((note) => !sung.has(onsetKey(note))).sort(byStartEndKey),
    T: lower.sort(byStartEndKey),
    B: bass,
  };
};
