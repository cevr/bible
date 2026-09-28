import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { cutsBetween, normalizeWords, placeBeats, timeScript, wordError } from './align.ts';
import type { Word } from './schema.ts';

const w = (text: string, start: number, end: number): Word => ({ text, start, end });

describe('normalizeWords and wordError', () => {
  test('punctuation and casing never count as an error', () => {
    expect(normalizeWords('Grace, freely GIVEN.')).toEqual(['grace', 'freely', 'given']);
    expect(wordError(normalizeWords("It's grace."), normalizeWords('its grace'))).toBe(0);
    expect(wordError(['a', 'b', 'c', 'd'], ['a', 'x', 'c'])).toBe(0.5);
  });
});

describe('timeScript', () => {
  test("the script's words take the times of the words heard, keeping the script's text", () => {
    const heard = [w('grace', 0.1, 0.5), w('freely', 0.6, 0.9), w('given', 1, 1.4)];
    expect(timeScript('Grace, freely given.', heard, 1.5)).toEqual([
      w('Grace,', 0.1, 0.5),
      w('freely', 0.6, 0.9),
      w('given.', 1, 1.4),
    ]);
  });

  test('a misheard word keeps its place and the time of what was heard in it', () => {
    const heard = [w('grace', 0.1, 0.5), w('freely', 0.6, 0.9), w('driven', 1, 1.4)];
    expect(timeScript('Grace, freely given.', heard, 1.5).at(2)).toEqual(w('given.', 1, 1.4));
  });

  test('a word nobody heard shares the gap between its neighbours', () => {
    const heard = [w('grace', 0, 0.4), w('given', 1, 1.4)];
    expect(timeScript('Grace freely given', heard, 1.5)).toEqual([
      w('Grace', 0, 0.4),
      w('freely', 0.4, 1),
      w('given', 1, 1.4),
    ]);
  });

  test('a word heard in two pieces spans both; an extra word heard is ignored', () => {
    const heard = [
      w('um', 0, 0.2),
      w('well', 0.3, 0.5),
      w('known', 0.5, 0.8),
      w('truth', 0.9, 1.2),
    ];
    expect(timeScript('Well-known truth.', heard, 1.3)).toEqual([
      w('Well-known', 0.3, 0.8),
      w('truth.', 0.9, 1.2),
    ]);
  });

  test('times stay in order and inside the take', () => {
    const heard = [w('one', 0, 0.5), w('two', 0.4, 0.3), w('three', 0.2, 9)];
    const timed = timeScript('one two three', heard, 2);
    for (const [i, word] of timed.entries()) {
      expect(word.start).toBeLessThanOrEqual(word.end);
      expect(word.end).toBeLessThanOrEqual(2);
      if (i > 0) expect(word.start).toBeGreaterThanOrEqual(timed[i - 1]?.start ?? 0);
    }
  });

  test('nothing heard spreads the words across the take', () => {
    expect(timeScript('a b', [], 2)).toEqual([w('a', 0, 1), w('b', 1, 2)]);
  });
});

describe('placeBeats', () => {
  const beats = [
    { id: 'one', text: 'In the beginning was the Word.' },
    { id: 'two', text: 'And the Word was with God.' },
  ];
  const heard = [
    ...'in the beginning was the word'.split(' ').map((t, i) => w(t, 0.5 + i * 0.3, 0.7 + i * 0.3)),
    ...'and the word was with god'.split(' ').map((t, i) => w(t, 4 + i * 0.3, 4.2 + i * 0.3)),
  ];

  test('each beat spans its own words in one reading of the script', () => {
    const placed = placeBeats(beats, heard);
    expect(Result.getOrThrow(placed)).toEqual([
      { id: 'one', start: 0.5, end: 0.7 + 5 * 0.3 },
      { id: 'two', start: 4, end: 4.2 + 5 * 0.3 },
    ]);
  });

  test('a beat the reading skipped fails, naming the beat', () => {
    const placed = placeBeats(beats, heard.slice(0, 6));
    expect(Result.isFailure(placed) && placed.failure).toMatchObject({
      _tag: 'BeatUnplaced',
      beat: 'two',
    });
  });

  test('cuts fall in the middle of the silence between beats', () => {
    const spans = [
      { id: 'one', start: 0.5, end: 2 },
      { id: 'two', start: 4, end: 5.7 },
    ];
    expect(cutsBetween(spans, 7)).toEqual([
      { id: 'one', from: 0, to: 3 },
      { id: 'two', from: 3, to: 7 },
    ]);
  });
});
