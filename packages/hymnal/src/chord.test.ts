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
