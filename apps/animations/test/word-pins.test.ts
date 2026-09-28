// Beats pinned to an unmarked word (`onWord`): the word is found by its
// letters after its mark, and each pin the righteousness-by-faith scenes make
// is a word the script really says after that mark, so no pin falls back to
// its mark unnoticed.

import { describe, expect, test } from 'bun:test';
import { script } from '../src/films/righteousness-by-faith/script.ts';
import { onWord, wordStart } from '../src/films/righteousness-by-faith/spoken.ts';

const MARKS = new Map([['is', 1]]);

/** A frame that hears three words, with one mark at 1 s. */
const heard = (t: number) => ({
  t,
  words: [
    { text: 'It', start: 0.5, end: 0.7 },
    { text: 'is', start: 1, end: 1.2 },
    { text: '“Not,', start: 1.4, end: 1.6 },
  ],
  mark: (name: string) => MARKS.get(name) ?? 0,
});

describe('wordStart', () => {
  test('finds a word after its mark by its letters, any case, quotes and commas ignored', () => {
    expect(wordStart(heard(0), 'is', 'not')).toBe(1.4);
  });

  test('ignores the word before its mark and falls back to the mark when it is never said', () => {
    expect(wordStart(heard(0), 'is', 'it')).toBe(1);
  });

  test('onWord runs 0 to 1 across its span from the word', () => {
    expect(onWord(heard(1.3), 'is', 'not', 0, 0.5)).toBe(0);
    expect(onWord(heard(1.9), 'is', 'not', 0, 0.5)).toBe(1);
  });
});

/** Every `onWord` pin the film makes: its mark and its word (`centurion`, `name`). */
const PINS = [
  ['gift', 'faith'],
  ['verdict', 'not'],
] as const;

describe('the film says each pinned word after its mark', () => {
  test.each(PINS)('{%s} … %s', (mark, word) => {
    const said = script.map((b) => b.say ?? '').find((say) => say.includes(`{${mark}}`));
    const after = said?.split(`{${mark}}`)[1] ?? '';
    expect(
      after.split(/\s+/).some((w) => w.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase() === word),
    ).toBe(true);
  });
});
