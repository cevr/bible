import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import * as Chord from './chord.js';

const F = { tonic: 'F', minor: false };
const Db = { tonic: 'Db', minor: false };
const named = (keys: number[], key: Chord.Key) => {
  const chord = Chord.fromPitches(keys, Math.min(...keys), Chord.pitchClass(key.tonic));
  return chord === undefined ? undefined : Chord.format(chord, key);
};

/** Each quality's notes: semitones above the root, and the letters above the root's letter. */
const MEMBERS: Record<Chord.Quality, ReadonlyArray<readonly [number, number]>> = {
  '': [
    [0, 0],
    [4, 2],
    [7, 4],
  ],
  m: [
    [0, 0],
    [3, 2],
    [7, 4],
  ],
  '7': [
    [0, 0],
    [4, 2],
    [7, 4],
    [10, 6],
  ],
  m7: [
    [0, 0],
    [3, 2],
    [7, 4],
    [10, 6],
  ],
  maj7: [
    [0, 0],
    [4, 2],
    [7, 4],
    [11, 6],
  ],
  '6': [
    [0, 0],
    [4, 2],
    [7, 4],
    [9, 5],
  ],
  m6: [
    [0, 0],
    [3, 2],
    [7, 4],
    [9, 5],
  ],
  dim: [
    [0, 0],
    [3, 2],
    [6, 4],
  ],
  dim7: [
    [0, 0],
    [3, 2],
    [6, 4],
    [9, 6],
  ],
  m7b5: [
    [0, 0],
    [3, 2],
    [6, 4],
    [10, 6],
  ],
  aug: [
    [0, 0],
    [4, 2],
    [8, 4],
  ],
  sus4: [
    [0, 0],
    [5, 3],
    [7, 4],
  ],
  sus2: [
    [0, 0],
    [2, 1],
    [7, 4],
  ],
  '7sus4': [
    [0, 0],
    [5, 3],
    [7, 4],
    [10, 6],
  ],
};
const LETTERS = 'CDEFGAB';
const NOTE = /^[A-G](#{1,2}|b{1,2})?/;

/** Every key a signature names, major and minor. */
const KEYS = Array.from({ length: 15 }, (_, i) => i - 7).flatMap((fifths) => [
  Chord.keyFromSignature(fifths, false),
  Chord.keyFromSignature(fifths, true),
]);

/** A diminished chord on #1, #2 or #5 of a major key: the leading tone of ii, iii or vi. */
const leadsUp = (key: Chord.Key, chord: Chord.Chord) =>
  !key.minor && ['dim', 'dim7', 'm7b5'].includes(chord.quality) && [1, 3, 8].includes(chord.root);

/** The letter a chord's bass is written on: a member's from the root's letter, unless that takes three accidentals. */
const bassLetter = (key: Chord.Key, chord: Chord.Chord, rootLetter: string, bass: number) => {
  const member = MEMBERS[chord.quality].find(
    ([semitones]) => semitones === (bass - chord.root + 12) % 12,
  );
  const keyLetter = Chord.spell(key, bass)[0];
  if (member === undefined) return keyLetter;
  const letter = LETTERS[(LETTERS.indexOf(rootLetter) + member[1]) % 7] ?? '';
  const off = (Chord.pitchClass(key.tonic) + bass - Chord.pitchClass(letter) + 12) % 12;
  return [10, 11, 0, 1, 2].includes(off) ? letter : keyLetter;
};

/** What is wrong with a chord's symbol in a key: none when its pitches and letters are right. */
const misspelled = (key: Chord.Key, chord: Chord.Chord): string[] => {
  const symbol = Chord.format(chord, key);
  const [head = '', bassName] = symbol.split('/');
  const rootName = NOTE.exec(head)?.[0] ?? '';
  const tonic = Chord.pitchClass(key.tonic);
  const raised = leadsUp(key, chord);
  const rootLetter = Chord.spell(key, raised ? chord.root - 1 : chord.root)[0] ?? '';
  const why = [
    Chord.pitchClass(rootName) === (tonic + chord.root) % 12 ? '' : 'root pitch',
    rootName[0] === rootLetter ? '' : `root letter, not ${rootLetter}`,
    raised && rootName.includes('b') ? 'raised root flat' : '',
  ];
  if (chord.bass !== undefined) {
    const bass = bassName ?? '';
    const letter = bassLetter(key, chord, rootLetter, chord.bass);
    why.push(
      NOTE.exec(bass)?.[0] === bass ? '' : 'bass not a note',
      Chord.pitchClass(bass) === (tonic + chord.bass) % 12 ? '' : 'bass pitch',
      bass[0] === letter ? '' : `bass letter, not ${letter}`,
    );
  }
  return why
    .filter((w) => w !== '')
    .map(
      (w) =>
        `${key.tonic}${key.minor ? 'm' : ''} ${symbol} (root ${chord.root}, bass ${chord.bass ?? '-'}): ${w}`,
    );
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
      // C3 G3 Eb4 E4: C with E-flat out, or C minor with E out.
      expect(without([48, 55, 63, 64], C)).toBeUndefined();
      expect(without([48, 55, 63, 64], C, { root: 0, quality: 'm' })).toBe('Cm');
      // Gb3 Ab3 Db4 C5 (hymn 100, bar 5): a suspension is no reading, so G-flat keeps sounding.
      expect(without([54, 56, 61, 72], Db)).toBeUndefined();
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

  it.effect('spells the examples the hymns showed misspelled as the score spells them', () =>
    Effect.sync(() => {
      const major = (tonic: string) => ({ tonic, minor: false });
      expect(Chord.format({ root: 4, quality: '', bass: 8 }, major('Eb'))).toBe('G/B');
      expect(Chord.format({ root: 4, quality: '', bass: 8 }, major('Ab'))).toBe('C/E');
      expect(Chord.format({ root: 4, quality: '', bass: 8 }, major('D'))).toBe('F#/A#');
      expect(Chord.format({ root: 9, quality: '', bass: 1 }, major('D'))).toBe('B/D#');
      expect(Chord.format({ root: 1, quality: 'dim', bass: 4 }, major('F'))).toBe('F#dim/A');
      expect(Chord.format({ root: 8, quality: 'dim7' }, major('Ab'))).toBe('Edim7');
      expect(Chord.format({ root: 1, quality: 'dim', bass: 4 }, major('G'))).toBe('G#dim/B');
      // A bass outside the chord keeps the key's spelling.
      expect(Chord.format({ root: 0, quality: '', bass: 8 }, major('Ab'))).toBe('Ab/Fb');
    }),
  );

  it.effect(
    'spells every chord on every degree of every key: right pitches, a member bass on its letter, a leading-tone diminished root sharp',
    () =>
      Effect.sync(() => {
        const wrong = KEYS.flatMap((key) =>
          Array.from({ length: 12 }, (_, root) => root).flatMap((root) =>
            Chord.Quality.literals.flatMap((quality) =>
              [undefined, ...Array.from({ length: 12 }, (_, bass) => bass)].flatMap((bass) =>
                misspelled(key, bass === undefined ? { root, quality } : { root, quality, bass }),
              ),
            ),
          ),
        );
        expect(wrong.slice(0, 10)).toEqual([]);
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
