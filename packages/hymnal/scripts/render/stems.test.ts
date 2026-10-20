import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import * as Midi from '../../src/midi.js';
import type { Voices } from '../../src/voices.js';
import { seeded, stemMidi, stemNotes } from './stems.js';
import type { Stem } from './style.js';

const note = (start: number, end: number, key: number): Midi.Note => ({
  start,
  end,
  key,
  channel: 0,
});

const VOICES: Voices = {
  S: [note(0, 384, 67), note(384, 768, 69)],
  A: [note(0, 768, 64)],
  T: [note(0, 384, 60), note(384, 768, 60)],
  B: [note(0, 768, 48)],
};

const stem = (parts: Stem['parts'], transpose = 0): Stem => ({
  name: 'test',
  sfz: 'x.sfz',
  parts,
  transpose,
  level: 0,
  pan: 0,
});

const HYMN: Midi.Midi = {
  ticksPerBeat: 384,
  tracks: [],
  timeSignatures: [{ tick: 0, numerator: 3, denominator: 4 }],
  keySignatures: [{ tick: 0, fifths: -2, minor: false }],
  tempos: [
    { tick: 0, microsPerQuarter: 600000 },
    { tick: 384, microsPerQuarter: 500000 },
  ],
  lastTick: 768,
};

describe('seeded', () => {
  it.effect('draws the same sequence from the same seed, and another from another', () =>
    Effect.sync(() => {
      const draws = (draw: () => number) => Array.from({ length: 5 }, draw);
      const first = draws(seeded('663-C-piano'));
      expect(draws(seeded('663-C-piano'))).toEqual(first);
      expect(draws(seeded('663-C-violas'))).not.toEqual(first);
      expect(first.every((x) => x >= 0 && x < 1)).toBe(true);
    }),
  );
});

describe('stemNotes', () => {
  it.effect('plays only its parts, transposed, each velocity within the humanise of its part', () =>
    Effect.sync(() => {
      const notes = stemNotes(VOICES, stem({ B: 60 }, -12), 'seed', 5);
      expect(notes.map((n) => [n.start, n.end, n.key])).toEqual([[0, 768, 36]]);
      expect(Math.abs((notes[0]?.velocity ?? 0) - 60)).toBeLessThanOrEqual(5);
    }),
  );

  it.effect('is the same for the same seed', () =>
    Effect.sync(() => {
      const piano = stem({ S: 84, A: 64, T: 64, B: 70 });
      expect(stemNotes(VOICES, piano, 'a', 5)).toEqual(stemNotes(VOICES, piano, 'a', 5));
    }),
  );

  it.effect('sounds one key once: a later onset ends the note before it, one tick joins two', () =>
    Effect.sync(() => {
      const voices: Voices = {
        S: [note(0, 500, 60)],
        A: [note(384, 768, 60), note(384, 600, 60)],
        T: [],
        B: [],
      };
      expect(stemNotes(voices, stem({ S: 80, A: 40 }), 'seed', 0)).toEqual([
        { start: 0, end: 384, key: 60, velocity: 80 },
        { start: 384, end: 768, key: 60, velocity: 40 },
      ]);
    }),
  );
});

describe('stemMidi', () => {
  it.effect("reads back as the stem's notes on the hymn file's own clock", () =>
    Effect.gen(function* () {
      const notes = stemNotes(VOICES, stem({ S: 84, B: 70 }), 'seed', 5);
      const midi = yield* Midi.parse(stemMidi(HYMN, notes));
      expect(midi.ticksPerBeat).toBe(384);
      expect(midi.tempos).toEqual(HYMN.tempos);
      expect(midi.timeSignatures).toEqual(HYMN.timeSignatures);
      expect(midi.keySignatures).toEqual(HYMN.keySignatures);
      expect(Midi.secondsOf(midi)).toBeCloseTo(Midi.secondsOf(HYMN), 9);
      const read = midi.tracks
        .flatMap((t) => t.notes)
        .map((n) => [n.start, n.end, n.key])
        .sort(
          (a, b) =>
            (a[0] ?? 0) - (b[0] ?? 0) || (a[1] ?? 0) - (b[1] ?? 0) || (a[2] ?? 0) - (b[2] ?? 0),
        );
      expect(read).toEqual(notes.map((n) => [n.start, n.end, n.key]));
    }),
  );
});
