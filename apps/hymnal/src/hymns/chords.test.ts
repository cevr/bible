/**
 * The reader's move and the chord book: a transpose wraps through the twelve
 * keys, a capo stops at its first and last fret, a key at rest is the key as
 * printed, and a hymn's chords are decoded once, or are none when they do not
 * decode.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { capoed, chordBook, keyName, playedKey, soundingKey, still, transposed } from './chords';

describe('a move', () => {
  it('wraps a transpose through the twelve keys, kept between -5 and 6', () => {
    expect(transposed({ transpose: 6, capo: 0 }, 1)).toEqual({ transpose: -5, capo: 0 });
    expect(transposed({ transpose: -5, capo: 3 }, -1)).toEqual({ transpose: 6, capo: 3 });
    expect(transposed(still, 12)).toEqual(still);
  });

  it('holds the capo between the open string and fret 11', () => {
    expect(capoed(still, -1)).toEqual(still);
    expect(capoed({ transpose: 2, capo: 11 }, 1)).toEqual({ transpose: 2, capo: 11 });
    expect(capoed(still, 2)).toEqual({ transpose: 0, capo: 2 });
  });

  it('keeps a key as printed at rest, and names the moved key as a signature does', () => {
    const gFlat = { tonic: 'Gb', minor: false } as const;
    expect(keyName(playedKey(gFlat, still))).toBe('Gb');
    expect(keyName(playedKey(gFlat, { transpose: 2, capo: 2 }))).toBe('Gb');
    expect(keyName(soundingKey(gFlat, { transpose: 12, capo: 0 }))).toBe('Gb');
    expect(keyName(soundingKey(gFlat, { transpose: 1, capo: 0 }))).toBe('G');
    const cSharpMinor = { tonic: 'C#', minor: true } as const;
    expect(keyName(playedKey(cSharpMinor, { transpose: 0, capo: 1 }))).toBe('Cm');
  });
});

describe('the chord book', () => {
  it('decodes a hymn once, however often it is shown', () => {
    const book = chordBook([[1, '[1,"F",false,[["syllable",["A~0|+b~5/9"]]],0]']]);
    const chords = book.of(1);
    expect(book.of(1)).toBe(chords);
    expect(book.decodes()).toBe(1);
    expect(Option.map(chords, (c) => c.stanzas)).toEqual(
      Option.some([
        {
          _tag: 'Sung',
          level: 'syllable',
          lines: [
            [
              [
                { text: 'A', chords: [{ root: 0, quality: '' }] },
                { text: 'b', chords: [{ root: 5, quality: '', bass: 9 }] },
              ],
            ],
          ],
        },
      ]),
    );
  });

  it('has no chords for a hymn whose string does not decode', () => {
    const book = chordBook([
      [1, '[1,"H",false,[0],0]'],
      [2, '[2,"F",false,[["syllable",["A~x"]]],0]'],
      [3, 'not json'],
    ]);
    expect([book.of(1), book.of(2), book.of(3), book.of(4)]).toEqual([
      Option.none(),
      Option.none(),
      Option.none(),
      Option.none(),
    ]);
    book.of(3);
    expect(book.decodes()).toBe(4);
  });
});
