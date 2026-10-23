/**
 * The Simple rule on lines made for each case: one syllable per box, its
 * text a letter, its chords degrees above C. Every hymn of the set is walked
 * in `chords.property.test.ts`.
 */

import { describe, expect, it } from 'bun:test';
import * as Chord from '@bible/hymnal/chord';
import { Option, Schema } from 'effect';

import type { Box, HymnChords } from './chords';
import { simple, styled } from './simple';

const C_MAJOR: Chord.Key = { tonic: 'C', minor: false };

const qualityOf = Schema.decodeUnknownSync(Chord.Quality);

/** A chord from its symbol in C: "G", "Dsus4", "Bdim". */
const named = (symbol: string): Chord.Chord => {
  const [, name = '', suffix = ''] = /^([A-G][#b]?)(.*)$/.exec(symbol) ?? [];
  const quality = qualityOf(suffix.replace(/^\+$/, 'aug'));
  return { root: Chord.pitchClass(name), quality };
};

/** A line of one-syllable words, each box's chords as symbols in C ("" for none). */
const line = (...boxes: ReadonlyArray<string>): ReadonlyArray<ReadonlyArray<Box>> =>
  boxes.map((chords, k) => [
    {
      text: String.fromCharCode(97 + (k % 26)),
      chords: chords
        .split(' ')
        .filter((c) => c !== '')
        .map(named),
    },
  ]);

const hymnOf = (...lines: ReadonlyArray<ReadonlyArray<ReadonlyArray<Box>>>): HymnChords => ({
  number: 1,
  key: C_MAJOR,
  stanzas: [{ _tag: 'Sung', level: 'syllable', lines }],
  refrain: Option.none(),
});

/** What each box of each line shows, spelled in C. */
const shown = (hymn: HymnChords): ReadonlyArray<ReadonlyArray<string>> => {
  const part = hymn.stanzas[0];
  if (part?._tag !== 'Sung') return [];
  return part.lines.map((l) =>
    l.flat().map((box) => box.chords.map((c) => Chord.format(c, C_MAJOR)).join(' ')),
  );
};

/** The chords of the first box of a hymn's first stanza. */
const firstBox = (hymn: HymnChords): ReadonlyArray<Chord.Chord> => {
  const part = hymn.stanzas[0];
  if (part?._tag !== 'Sung') return [];
  return part.lines[0]?.[0]?.[0]?.chords ?? [];
};

const simpleOf = (...lines: ReadonlyArray<ReadonlyArray<ReadonlyArray<Box>>>) =>
  shown(simple(hymnOf(...lines)));

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** Decided 2's plain form of each quality, read alone: the root it moves by and the quality it keeps. */
const PLAIN: ReadonlyArray<readonly [Chord.Quality, number, '' | 'm' | '7']> = [
  ['', 0, ''],
  ['m', 0, 'm'],
  ['7', 0, '7'],
  ['m7', 0, 'm'],
  ['m6', 0, 'm'],
  ['maj7', 0, ''],
  ['6', 0, ''],
  ['aug', 0, ''],
  ['dim', -4, '7'],
  ['dim7', -4, '7'],
  ['m7b5', 3, 'm'],
  ['sus4', 0, ''],
  ['sus2', 0, ''],
  ['7sus4', 0, '7'],
];

describe('Simple chords', () => {
  it('shows each quality on each root in its plain form, the bass dropped', () => {
    expect(PLAIN.map(([quality]) => quality).toSorted()).toEqual(
      [...Chord.Quality.literals].toSorted(),
    );
    for (const [quality, by, plain] of PLAIN)
      for (let root = 0; root < 12; root += 1) {
        const hymn = hymnOf([[{ text: 'a', chords: [{ root, quality, bass: mod12(root + 7) }] }]]);
        const chords = firstBox(simple(hymn));
        expect({ quality, root, chords }).toEqual({
          quality,
          root,
          chords: [{ root: mod12(root + by), quality: plain }],
        });
      }
  });

  it('resolves a sus to the next chord on its root, and reads it alone otherwise', () => {
    expect(simpleOf(line('G', 'Dsus4 Dsus2', 'D'))).toEqual([['G', 'D', '']]);
    expect(simpleOf(line('C', 'Asus4', 'Am'))).toEqual([['C', 'Am', '']]);
    expect(simpleOf(line('C', 'G7sus4', 'G'))).toEqual([['C', 'G', '']]);
    expect(simpleOf(line('C', 'Gsus4', 'Am'))).toEqual([['C', 'G', 'Am']]);
    expect(simpleOf(line('C', 'Gsus4 G7sus4', 'Gm'))).toEqual([['C', 'Gm', '']]);
    expect(simpleOf(line('C', 'G7sus4'))).toEqual([['C', 'G7']]);
    expect(simpleOf(line('C', 'Gsus2'))).toEqual([['C', 'G']]);
  });

  it('shows a stack’s first chord, and the chord it ends on over the next chordless syllable', () => {
    expect(simpleOf(line('F C', '', '', 'G'))).toEqual([['F', 'C', '', 'G']]);
    expect(simpleOf(line('C', 'Dm7 G7', 'Am'))).toEqual([['C', 'Dm', 'Am']]);
  });

  it('carries a held chord over chordless syllables and does not show it again', () => {
    expect(simpleOf(line('G', '', '', 'G', 'Gmaj7', 'D'))).toEqual([['G', '', '', '', '', 'D']]);
  });

  it('starts each line with no chord shown until its own first chord', () => {
    expect(simpleOf(line('C', 'G'), line('', '', 'G', 'C'))).toEqual([
      ['C', 'G'],
      ['', '', 'G', 'C'],
    ]);
  });

  it('drops a passing chord one syllable long between two of the same chord', () => {
    expect(simpleOf(line('C', 'F', 'C', 'G'))).toEqual([['C', '', '', 'G']]);
    expect(simpleOf(line('C', 'F', 'C', 'F', 'C'))).toEqual([['C', '', '', '', '']]);
    expect(simpleOf(line('C', 'F', '', 'C'))).toEqual([['C', 'F', '', 'C']]);
    expect(simpleOf(line('C', 'F', 'G'))).toEqual([['C', 'F', 'G']]);
    expect(simpleOf(line('C', 'Bdim', 'C'))).toEqual([['C', '', '']]);
  });

  it('keeps the words, the boxes and plain parts as they are', () => {
    const hymn: HymnChords = {
      ...hymnOf(line('C', '', 'G')),
      stanzas: [{ _tag: 'Plain' }, ...hymnOf(line('C', '', 'G')).stanzas],
    };
    const made = simple(hymn);
    expect(made.stanzas[0]).toBe(hymn.stanzas[0]);
    const texts = (h: HymnChords) =>
      h.stanzas.map((p) => {
        if (p._tag === 'Plain') return p._tag;
        return p.lines.map((l) => l.map((w) => w.map((b) => b.text)));
      });
    expect(texts(made)).toEqual(texts(hymn));
    expect({ number: made.number, key: made.key }).toEqual({ number: 1, key: C_MAJOR });
  });

  it('gives Advanced the decoded chords themselves, and Simple a new reading', () => {
    const hymn = hymnOf(line('C', 'Dsus4 D'));
    expect(styled(hymn, 'advanced')).toBe(hymn);
    expect(shown(styled(hymn, 'simple'))).toEqual([['C', 'D']]);
  });
});
