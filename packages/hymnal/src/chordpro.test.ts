import { Effect, Result } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import * as ChordPro from './chordpro.js';
import type { Sung } from './hymn.js';

const key = { tonic: 'F', minor: false };
const F = { root: 0, quality: '' } as const;
const C = { root: 7, quality: '' } as const;
const C7 = { root: 7, quality: '7' } as const;
const Gm7Bb = { root: 2, quality: 'm7', bass: 5 } as const;

const part: Sung = {
  _tag: 'Sung',
  level: 'syllable',
  lines: [
    [
      { text: 'King', word: 0, notes: 1, beats: 1, full: [{ chord: F, at: 0 }] },
      { text: 'of', word: 1, notes: 1, beats: 1 },
      { text: 'cre', word: 2, notes: 1, beats: 1, full: [{ chord: F, at: 0 }] },
      {
        text: 'a',
        word: 2,
        notes: 1,
        beats: 3,
        full: [
          { chord: Gm7Bb, at: 0 },
          { chord: C, at: 1 },
          { chord: C7, at: 2 },
        ],
      },
      { text: 'tion!', word: 2, notes: 1, beats: 3, full: [{ chord: F, at: 0 }] },
    ],
    [
      { text: "o'er", word: 0, notes: 1, beats: 1, full: [{ chord: { ...F, bass: 9 }, at: 0 }] },
      { text: 'the', word: 1, notes: 0, beats: 0 },
      { text: 'well-', word: 2, notes: 1, beats: 1 },
      { text: 'spring', word: 2, notes: 2, beats: 2, full: [{ chord: C, at: 1.5 }] },
    ],
  ],
  fit: { notes: 9, syllables: 9, melismas: 1, shared: { inWord: 0, acrossWords: 1 }, cost: 1 },
  why: ['shared'],
};

describe('ChordPro', () => {
  it.effect("reads back the syllables and chords a part's render writes", () =>
    Effect.gen(function* () {
      const chart = `{start_of_verse: Verse 1}\n${ChordPro.render(part, key, 'full')}\n{end_of_verse}\n`;
      expect(chart).toContain('cre-[Gm7/Bb]a ~[C] ~[C7] -[F]tion!');
      const [section] = yield* ChordPro.parse(chart);
      expect(section?.part).toBe(1);
      expect(section?.level).toBe('full');
      expect(
        section?.lines.map((line) =>
          line.map((s) => [s.text, s.word, ChordPro.chords(s)].join(' ')),
        ),
      ).toEqual(
        part.lines.map((line) =>
          line.map((s) =>
            [s.text, s.word, ChordPro.chords(ChordPro.chartChords(s, 'full', key))].join(' '),
          ),
        ),
      );
    }),
  );

  it.effect('fails on a token it cannot read, naming its line', () =>
    Effect.gen(function* () {
      for (const words of ['[F]King of [C', 'King ~C of', 'King of]', '~[C] King']) {
        const result = yield* Effect.result(
          ChordPro.parse(`{start_of_verse: Verse 1}\n${words}\n{end_of_verse}`),
        );
        expect(Result.isFailure(result) && result.failure.line).toBe(2);
      }
    }),
  );
});
