// The Transcript view's layout and lighting, pure: each word's offset in the
// one text (stable whether cuts show or not), its start on the film's clock,
// the word lit at a time, and the name Mark here gives a word.

import { describe, expect, test } from 'bun:test';
import { Option, Result, Schema } from 'effect';
import type { TalkWords } from '../../core/api.ts';
import { layout } from '../../core/layout.ts';
import { MarkName } from '../../core/talk.ts';
import { markName, rangesOf, rowsIn, rowsOf, wordAt } from './lit.ts';

/** Each section's voice starting a quarter second in, as a talk's lead-in puts it. */
const LEAD = 0.25;
const placed = Result.getOrThrow(
  layout(
    [
      { id: 'ask', min: 2 },
      { id: 'answer', min: 3 },
    ],
    { voice: '', scenes: {} },
  ),
).map((p) => ({ ...p, speechStart: LEAD }));
const answerAt = (placed[1]?.start ?? Number.NaN) + LEAD;

const TALK: TalkWords = {
  file: 'talk.ts',
  sections: [
    {
      id: 'ask',
      take: 'a',
      words: [
        { index: 0, text: 'Why', struck: false, heard: [0, 0.3] as const },
        { index: 1, text: 'um', struck: true },
        { index: 2, text: 'law?', struck: false, heard: [0.5, 0.9] as const },
      ],
      marks: {},
    },
    {
      id: 'answer',
      take: 'a',
      words: [{ index: 3, text: 'To', struck: false, heard: [0.2, 0.4] as const }],
      marks: { to: 3 },
    },
  ],
};

describe("the Transcript view's words", () => {
  test('each has its offset in one text, struck ones counted, and starts where its section plays it', () => {
    const [ask, answer] = rowsOf(TALK, placed);
    expect(ask?.rows.map((r) => [r.text, r.from, r.start])).toEqual([
      ['Why', 0, Option.some(LEAD)],
      ['um', 4, Option.none()],
      ['law?', 7, Option.some(LEAD + 0.5)],
    ]);
    expect(answer?.rows.map((r) => [r.from, r.start])).toEqual([[12, Option.some(answerAt + 0.2)]]);
    expect(rangesOf(rowsIn(rowsOf(TALK, placed), 'ask', 1, 2))).toEqual([
      [4, 6],
      [7, 11],
    ]);
  });

  test('the word lit is the one playing, else the last said in its section; none before the first', () => {
    const sections = rowsOf(TALK, placed);
    expect(wordAt(sections, placed, 0.1)).toEqual(Option.none());
    expect(wordAt(sections, placed, LEAD + 0.1)).toEqual(Option.some({ section: 'ask', index: 0 }));
    expect(wordAt(sections, placed, LEAD + 0.45)).toEqual(
      Option.some({ section: 'ask', index: 0 }),
    );
    expect(wordAt(sections, placed, LEAD + 0.5)).toEqual(Option.some({ section: 'ask', index: 2 }));
    expect(wordAt(sections, placed, answerAt + 0.1)).toEqual(Option.none());
    expect(wordAt(sections, placed, answerAt + 0.2)).toEqual(
      Option.some({ section: 'answer', index: 3 }),
    );
  });

  test('Mark here names the mark from the word, numbered past a name another word has', () => {
    expect(markName('Law?', 2, {})).toBe('law');
    expect(markName('To', 3, { to: 3 })).toBe('to');
    expect(markName('to', 5, { to: 3 })).toBe('to-2');
    expect(markName('to', 6, { to: 3, 'to-2': 5 })).toBe('to-3');
    expect(markName('—', 1, {})).toBe('mark');
  });

  test("Mark here's name is one the talk keeps (`MarkName`): a letter's accent let go, a word of no such letters `mark`", () => {
    expect(markName('Café', 3, {})).toBe('cafe');
    expect(markName('Señor,', 4, {})).toBe('senor');
    expect(markName('日本', 5, {})).toBe('mark');
    expect(markName('naïve', 6, { naive: 2 })).toBe('naive-2');
    for (const word of ['Café', 'Señor,', '日本', 'Law?', '—', "don't", 'ÆON'])
      expect(Schema.is(MarkName)(markName(word, 1, {}))).toBe(true);
  });
});
