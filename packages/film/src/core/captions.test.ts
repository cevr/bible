import { Result } from 'effect';
import { describe, expect, test } from 'bun:test';
import { captionCues, filmCaptions, vttTime, webVtt } from './captions.ts';
import { hashText } from './narration.ts';
import { layout } from './layout.ts';
import { unmeasured } from './voiced.ts';
import type { Timings, Word } from './schema.ts';

const word = (text: string, start: number, end: number): Word => ({ text, start, end });

/** Two lines: the first ends at the comma. */
const words = [word('Grace,', 0.2, 0.6), word('freely', 0.8, 1.2), word('given.', 1.3, 1.9)];

describe('captionCues', () => {
  test('the first line leads its word; each holds until the next line, with no overlap', () => {
    expect(captionCues(words)).toEqual([
      { start: 0.2 - 0.05, end: 0.8, text: 'Grace,' },
      { start: 0.8, end: 1.9 + 0.6, text: 'freely given.' },
    ]);
  });

  test('no words, no cues', () => {
    expect(captionCues([])).toEqual([]);
  });

  test('a line never spans two voices, and each voice opens with a dash', () => {
    const dialogue = [
      word('Declared', 0, 0.4),
      word('righteous', 0.5, 0.9),
      word('But', 1.2, 1.4),
      word('he', 1.5, 1.6),
      word('is', 1.7, 1.8),
      word('guilty.', 1.9, 2.4),
      word('Exactly.', 2.8, 3.3),
    ];
    const turns = [
      { voice: 'ask', word: 2 },
      { voice: 'lead', word: 6 },
    ];
    expect(captionCues(dialogue, turns).map((c) => c.text)).toEqual([
      '- Declared righteous',
      '- But he is guilty.',
      '- Exactly.',
    ]);
  });

  test("a voice's later lines carry no dash", () => {
    const long = [word('One,', 0, 0.2), word('two.', 0.3, 0.5), word('Three.', 0.8, 1)];
    expect(captionCues(long, [{ voice: 'ask', word: 2 }]).map((c) => c.text)).toEqual([
      '- One,',
      'two.',
      '- Three.',
    ]);
  });
  test('a line breaks where a clause ends, on an en dash or an ellipsis too', () => {
    const said = ['Wait…', 'one', 'moment–', 'then', 'go.'].map((t, i) => word(t, i, i + 0.5));
    expect(captionCues(said).map((c) => c.text)).toEqual(['Wait…', 'one moment–', 'then go.']);
  });
});

const timings: Timings = {
  voice: 'v',
  scenes: {
    a: {
      hash: hashText('Grace, freely given.'),
      file: 'a.mp3',
      duration: 2,
      words: unmeasured(words),
      source: 'elevenlabs',
    },
    b: {
      hash: hashText('Amen.'),
      file: 'b.mp3',
      duration: 1,
      words: unmeasured([word('Amen.', 0, 0.5)]),
      source: 'elevenlabs',
    },
  },
};
const placed = Result.getOrThrow(
  layout(
    [
      { id: 'a', say: 'Grace, freely given.', lead: 1, tail: 0.1 },
      { id: 'b', say: 'Amen.', lead: 0.5, tail: 1 },
    ],
    timings,
  ),
);

describe('filmCaptions', () => {
  test('places each line in film time and clips it to its scene', () => {
    const cues = filmCaptions(placed, { from: 0, to: 10 });
    expect(cues.map((c) => c.text)).toEqual(['Grace,', 'freely given.', 'Amen.']);
    // Scene a is 1 + 2 + 0.1 long; its last line's hold would run past it.
    expect(cues[1]?.end).toBeCloseTo(3.1);
    // Scene b's first line leads its word, after the scene's own lead.
    expect(cues[2]?.start).toBeCloseTo(3.1 + 0.5 - 0.05);
  });

  test('a range shifts to zero and drops what it does not cover', () => {
    const cues = filmCaptions(placed, { from: 2, to: 3 });
    expect(cues).toHaveLength(1);
    expect(cues[0]?.text).toBe('freely given.');
    expect(cues[0]?.start).toBe(0);
    expect(cues[0]?.end).toBeCloseTo(1);
  });
});

describe('webVtt', () => {
  test('timestamps are HH:MM:SS.mmm', () => {
    expect(vttTime(0)).toBe('00:00:00.000');
    expect(vttTime(3723.4567)).toBe('01:02:03.457');
  });

  test('writes numbered cues after the header', () => {
    expect(webVtt([{ start: 1, end: 2.5, text: 'Grace,' }])).toBe(
      'WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.500\nGrace,\n',
    );
  });
});
