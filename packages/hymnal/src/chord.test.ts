import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import * as Chord from './chord.js';

const F = { tonic: 'F', minor: false } as const;
const Db = { tonic: 'Db', minor: false } as const;
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
const NATURALS = [0, 2, 4, 5, 7, 9, 11];

/**
 * The letter each degree is written on, as steps above the tonic's letter,
 * in major and minor keys alike: b2, 2, b3, 3, 4, #4, 5, b6, 6, b7, 7.
 */
const DEGREE_LETTERS = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6];

/** How each quality is written after its root. */
const SUFFIXES: Record<Chord.Quality, string> = {
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

/** A spelled note's pitch class, read here rather than through the module. */
const pitchOf = (name: string) =>
  ([...name.slice(1)].reduce(
    (pc, c) => pc + (c === '#' ? 1 : -1),
    (NATURALS[LETTERS.indexOf(name[0] ?? 'C')] ?? 0) + 12,
  ) +
    12) %
  12;

/** The note on a letter (steps from C, any octave) at a pitch class; undefined past two accidentals. */
const onLetter = (letter: number, pc: number): string | undefined => {
  const at = ((letter % 7) + 7) % 7;
  const offset = (pc - (NATURALS[at] ?? 0) + 12) % 12;
  const accidental = [
    '',
    '#',
    '##',
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    'bb',
    'b',
  ][offset];
  return accidental === undefined ? undefined : `${LETTERS[at]}${accidental}`;
};

/** Every key the schema admits, from every tonic a signature could be written with, in both modes. */
const KEYS = [...LETTERS]
  .flatMap((letter) => [letter, `${letter}#`, `${letter}b`])
  .flatMap((tonic) => [
    { tonic, minor: false },
    { tonic, minor: true },
  ])
  .filter(Schema.is(Chord.Key));

/** A diminished chord on #1, #2 or #5 of a major key: the leading tone of ii, iii or vi. */
const leadsUp = (key: Chord.Key, chord: Chord.Chord) =>
  !key.minor && ['dim', 'dim7', 'm7b5'].includes(chord.quality) && [1, 3, 8].includes(chord.root);

/**
 * The symbol a score writes, by letter arithmetic alone: the root on its
 * degree's letter (a raised diminished root on the letter below), a member
 * bass on the letter its interval gives unless that takes three accidentals,
 * any other bass on its degree's letter.
 */
const expected = (key: Chord.Key, chord: Chord.Chord): string => {
  const tonicLetter = LETTERS.indexOf(key.tonic[0] ?? 'C');
  const tonic = pitchOf(key.tonic);
  const degreeLetter = (degree: number) => tonicLetter + (DEGREE_LETTERS[degree] ?? 0);
  const rootLetter = degreeLetter(leadsUp(key, chord) ? chord.root - 1 : chord.root);
  const root = onLetter(rootLetter, tonic + chord.root) ?? '?';
  const symbol = `${root}${SUFFIXES[chord.quality]}`;
  if (chord.bass === undefined) return symbol;
  const pc = tonic + chord.bass;
  const member = MEMBERS[chord.quality].find(
    ([semitones]) => semitones === (chord.bass! - chord.root + 12) % 12,
  );
  const asMember = member === undefined ? undefined : onLetter(rootLetter + member[1], pc);
  return `${symbol}/${asMember ?? onLetter(degreeLetter(chord.bass), pc) ?? '?'}`;
};

/** What is wrong with a chord's symbol in a key: none when it is the one a score writes. */
const misspelled = (key: Chord.Key, chord: Chord.Chord): string[] => {
  const symbol = Chord.format(chord, key);
  const want = expected(key, chord);
  return symbol === want
    ? []
    : [
        `${key.tonic}${key.minor ? 'm' : ''} root ${chord.root} ${chord.quality} bass ${chord.bass ?? '-'}: ${symbol}, not ${want}`,
      ];
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
      const C = { tonic: 'C', minor: false } as const;
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
      const major = (tonic: Extract<Chord.Key, { minor: false }>['tonic']) =>
        ({ tonic, minor: false }) as const;
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
        // The 15 major and 15 minor keys a signature writes, and no other.
        expect(KEYS.length).toBe(30);
      }),
  );

  it.effect('reads a key signature as its key, minor keys by their relative major', () =>
    Effect.sync(() => {
      expect(Chord.keyFromSignature(-5, false)).toEqual(Db);
      expect(Chord.keyFromSignature(-1, true)).toEqual({ tonic: 'D', minor: true });
      expect(Chord.keyFromSignature(3, false)).toEqual({ tonic: 'A', minor: false });
    }),
  );

  it.effect('names the key on a tonic pitch as a signature writes it, every one a key', () =>
    Effect.sync(() => {
      expect(Chord.keyOnPitch(1, false)).toEqual(Db);
      expect(Chord.keyOnPitch(1, true)).toEqual({ tonic: 'C#', minor: true });
      expect(Chord.keyOnPitch(6, false)).toEqual({ tonic: 'F#', minor: false });
      expect(Chord.keyOnPitch(3, true)).toEqual({ tonic: 'Eb', minor: true });
      expect(Chord.keyOnPitch(8, true)).toEqual({ tonic: 'G#', minor: true });
      const all = Array.from({ length: 24 }, (_, i) => Chord.keyOnPitch(i % 12, i >= 12));
      expect(all.filter((key) => !Schema.is(Chord.Key)(key))).toEqual([]);
      expect(all.map((key) => Chord.pitchClass(key.tonic))).toEqual(
        Array.from({ length: 24 }, (_, i) => i % 12),
      );
    }),
  );
});
