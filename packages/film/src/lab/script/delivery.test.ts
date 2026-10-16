import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import type { Mark } from '../../core/delivery.ts';
import { parse } from '../../core/narration.ts';
import type { TakeWord } from '../../core/schema.ts';
import { voicedAt } from '../../core/voiced.ts';
import {
  gapBefore,
  gapOpen,
  gapSet,
  heardAt,
  paceOf,
  retaken,
  spanOf,
  stressToggled,
} from './delivery.ts';

/** A take word said from `start` to `end`. */
const word = (text: string, start: number, end: number): TakeWord => ({
  text,
  start,
  end,
  voiced: voicedAt(start, end),
});

/** A line's delivery marks as the reader reads them; none of a line that does not parse. */
const deliveryOf = (beat: string, say: string): ReadonlyArray<Mark> =>
  Result.match(parse(beat, say), {
    onFailure: () => [],
    onSuccess: (parsed) => parsed.delivery,
  });

describe('the reader’s delivery marks', () => {
  const marks = deliveryOf('cold', 'Not by works. {//1.5} By {*}faith.');

  test('reads a line’s marks, and none of a line that does not parse', () => {
    expect(marks).toEqual([
      { _tag: 'Hold', before: 3, seconds: 1.5 },
      { _tag: 'Stress', word: 4 },
    ]);
    expect(deliveryOf('cold', '{/} Not')).toEqual([]);
  });

  test('Stress toggles over the words selected', () => {
    expect(stressToggled(marks, 3, 4)).toEqual([
      { _tag: 'Hold', before: 3, seconds: 1.5 },
      { _tag: 'Stress', word: 3 },
      { _tag: 'Stress', word: 4 },
    ]);
    expect(stressToggled(marks, 4, 4)).toEqual([{ _tag: 'Hold', before: 3, seconds: 1.5 }]);
  });

  test('a gap holds one pause, set or taken out, never the line’s first', () => {
    expect(gapBefore(marks, 3)).toEqual({ _tag: 'Hold', seconds: 1.5 });
    expect(gapBefore(marks, 2)).toEqual({ _tag: 'None' });
    const breath: ReadonlyArray<Mark> = gapSet(marks, 3, { _tag: 'Breath' });
    expect(breath).toEqual([
      { _tag: 'Breath', before: 3 },
      { _tag: 'Stress', word: 4 },
    ]);
    expect(gapSet(breath, 3, { _tag: 'None' })).toEqual([{ _tag: 'Stress', word: 4 }]);
    expect([gapOpen(0, 5), gapOpen(3, 5), gapOpen(5, 5)]).toEqual([false, true, false]);
  });
});

describe('a staging take as the reader plays it', () => {
  // Two words a second: 120 wpm, under the band.
  const words = [word('Not', 0.1, 0.5), word('by', 0.6, 0.8), word('works.', 0.9, 1.6)];

  test('its pace, against the band', () => {
    expect(paceOf(words)).toEqual(Option.some({ wpm: 120, band: 'slow' }));
    expect(paceOf([])).toEqual(Option.none());
  });

  test('the word heard at a moment, and the stretch that says some words', () => {
    expect(heardAt(words, 0)).toEqual(Option.none());
    expect(heardAt(words, 0.7)).toEqual(Option.some(1));
    expect(spanOf(words, 1, 2)).toEqual(Option.some({ start: 0.6, end: 1.6 }));
    expect(spanOf(words, 1, 9)).toEqual(Option.none());
  });
});

describe('retaken', () => {
  const ready = (file: string) => ({ _tag: 'Ready', file, duration: 1, words: [] }) as const;
  const voicing = { _tag: 'Voicing' } as const;
  test('a ready take that is now another file, or voicing again, is a line changed', () => {
    expect(retaken(new Map([['1', ready('a')]]), new Map([['1', ready('b')]]))).toBe(true);
    expect(retaken(new Map([['1', ready('a')]]), new Map([['1', voicing]]))).toBe(true);
  });
  test('the same take, a take first made, or a beat no longer read is no change', () => {
    expect(retaken(new Map([['1', ready('a')]]), new Map([['1', ready('a')]]))).toBe(false);
    expect(retaken(new Map([['1', voicing]]), new Map([['1', ready('a')]]))).toBe(false);
    expect(retaken(new Map([['1', ready('a')]]), new Map())).toBe(false);
    expect(retaken(new Map(), new Map([['1', ready('a')]]))).toBe(false);
  });
});
