import { describe, expect, test } from 'bun:test';
import { Result, Schema } from 'effect';
import { Timings, TimingsJson, type VoiceTiming, type Word } from './schema.ts';

const take: VoiceTiming = {
  hash: 'h',
  file: 'a.mp3',
  duration: 2,
  words: [
    { text: 'Look', start: 0, end: 0.4 },
    { text: 'and', start: 0.5, end: 0.8 },
    { text: 'live.', start: 0.9, end: 2 },
  ],
};

const decodes = (a: VoiceTiming) =>
  Result.isSuccess(Schema.decodeResult(Timings)({ voice: 'v', scenes: { a } }));

/** `take` with word `i` changed. */
const withWord = (i: number, word: Partial<Word>): VoiceTiming => ({
  ...take,
  words: take.words.map((w, k) => {
    if (k !== i) return w;
    return { ...w, ...word };
  }),
});

describe('Timings', () => {
  test('a well-formed take decodes from its file, and encodes back', () => {
    const text = Schema.encodeSync(TimingsJson)({ voice: 'v', scenes: { a: take } });
    expect(Schema.encodeSync(TimingsJson)(Schema.decodeSync(TimingsJson)(text))).toBe(text);
  });

  test('a take with no words (a silent take) decodes', () => {
    expect(decodes({ ...take, words: [] })).toBe(true);
  });

  test('refuses a negative duration', () => {
    expect(decodes({ ...take, duration: -5 })).toBe(false);
  });

  test('refuses a word that starts before 0 or ends before it starts', () => {
    expect(decodes(withWord(0, { start: -0.1 }))).toBe(false);
    expect(decodes(withWord(1, { start: 0.9, end: 0.6 }))).toBe(false);
  });

  test('refuses words out of order', () => {
    expect(decodes(withWord(2, { start: 0.2 }))).toBe(false);
  });

  test('refuses a word that ends after the take', () => {
    expect(decodes(withWord(2, { start: 99, end: 99.5 }))).toBe(false);
    // Within the tolerance the take's measured length is allowed to differ by.
    expect(decodes(withWord(2, { end: 2.01 }))).toBe(true);
  });
});
