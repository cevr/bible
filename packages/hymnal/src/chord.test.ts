import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import * as Chord from './chord.js';

const F = { tonic: 'F', minor: false };
const Db = { tonic: 'Db', minor: false };
const named = (keys: number[], key: Chord.Key) => {
  const chord = Chord.fromPitches(keys, Math.min(...keys), Chord.pitchClass(key.tonic));
  return chord === undefined ? undefined : Chord.format(chord, key);
};

describe('Chord.fromPitches', () => {
  it.effect('names four voices with the bass tried as the root first', () =>
    Effect.sync(() => {
      expect(named([65, 60, 57, 53], F)).toBe('F');
      expect(named([64, 60, 55, 52], F)).toBe('C/E');
      expect(named([64, 58, 55, 43], F)).toBe('Edim/G');
      // Alone, these notes are B-flat with an added sixth; harmony.ts reads them on.
      expect(named([67, 62, 53, 46], F)).toBe('Bb6');
      // G-flat with an added sixth, not E-flat minor seventh over its third.
      expect(named([63, 61, 58, 54], Db)).toBe('Gb6');
      expect(named([70, 64, 61, 55], Db)).toBe('Gdim7');
      expect(named([65, 61, 57, 49], Db)).toBe('Db+');
    }),
  );

  it.effect('leaves a set no quality matches unnamed', () =>
    Effect.sync(() => {
      expect(named([72, 61, 56, 54], Db)).toBeUndefined();
    }),
  );
});

describe('Chord.overBass and Chord.withoutOne', () => {
  const name = (chord: Chord.Chord | undefined, key: Chord.Key) =>
    chord === undefined ? undefined : Chord.format(chord, key);
  const over = (keys: number[], key: Chord.Key) =>
    name(Chord.overBass(keys, Chord.pitchClass(key.tonic)), key);
  const without = (keys: number[], key: Chord.Key, sounding?: Chord.Chord) =>
    name(Chord.withoutOne(keys, Chord.pitchClass(key.tonic), sounding), key);

  it.effect('names the chord above a bass it leaves out (hymn 100, bar 23)', () =>
    Effect.sync(() => {
      // Eb3 Ab3 F4 Db5: D-flat over E-flat.
      expect(over([51, 56, 65, 73], Db)).toBe('Db/Eb');
      // The bass doubled above, or two notes above it: no chord over a foreign bass.
      expect(over([51, 63, 65, 73], Db)).toBeUndefined();
      expect(over([51, 65, 73], Db)).toBeUndefined();
    }),
  );

  it.effect('names the one chord a set makes with one note left out (hymn 100, bar 10)', () =>
    Effect.sync(() => {
      // Db3 C4 Gb4 Bb4: G-flat over D-flat with a passing C.
      expect(without([49, 60, 66, 70], Db)).toBe('Gb/Db');
      // Db3 Bb3 Ab4 C5: only B-flat minor seventh with its fifth left out, which names nothing.
      expect(without([49, 58, 68, 72], Db)).toBeUndefined();
    }),
  );

  it.effect('leaves two one-note-out readings unnamed, unless one is already sounding', () =>
    Effect.sync(() => {
      const C = { tonic: 'C', minor: false };
      // C3 C4 D4 E4 G4: C with D out, or Csus2 with E out.
      expect(without([48, 60, 62, 64, 67], C)).toBeUndefined();
      expect(without([48, 60, 62, 64, 67], C, { root: 0, quality: '' })).toBe('C');
    }),
  );
});

describe('Chord.simplify', () => {
  it.effect(
    'plays a diminished triad as the dominant seventh it stands for, and drops the bass',
    () =>
      Effect.sync(() => {
        const chord = Chord.fromPitches([64, 58, 55, 43], 43, Chord.pitchClass('F'));
        expect(chord && Chord.format(Chord.simplify(chord), F)).toBe('C7');
        expect(Chord.format(Chord.simplify({ root: 5, quality: '6', bass: 0 }), Db)).toBe('Gb');
      }),
  );
});

describe('Chord.format', () => {
  it.effect('spells each degree with its key own accidentals', () =>
    Effect.sync(() => {
      const raisedFourth = { root: 6, quality: 'dim7' } as const;
      expect(Chord.format(raisedFourth, Db)).toBe('Gdim7');
      expect(Chord.format(raisedFourth, { tonic: 'C', minor: false })).toBe('F#dim7');
      const flatSeven = { root: 10, quality: '' } as const;
      expect(Chord.format(flatSeven, { tonic: 'G', minor: false })).toBe('F');
      expect(Chord.format(flatSeven, { tonic: 'E', minor: false })).toBe('D');
      expect(Chord.format({ root: 7, quality: 'm', bass: 2 }, Db)).toBe('Abm/Eb');
    }),
  );

  it.effect('reads a key signature as its key, minor keys by their relative major', () =>
    Effect.sync(() => {
      expect(Chord.keyFromSignature(-5, false)).toEqual(Db);
      expect(Chord.keyFromSignature(-1, true)).toEqual({ tonic: 'D', minor: true });
      expect(Chord.keyFromSignature(3, false)).toEqual({ tonic: 'A', minor: false });
    }),
  );
});
