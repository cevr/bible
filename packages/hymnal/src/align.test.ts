import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { align } from './align.js';
import * as Midi from './midi.js';
import * as Fixture from './midi-fixture.js';
import * as Score from './score.js';

/** One verse of a tune in 4/4, a bass striking with every note so none moves alone. */
const tune = (soprano: Fixture.Voice) =>
  Effect.gen(function* () {
    const bass = soprano.map(([key, beats]) => [key - 24, beats] as const);
    const tracks = [
      { program: 5, voices: [soprano] },
      { program: 5, voices: [bass] },
    ];
    return Score.fromMidi(yield* Midi.parse(Fixture.write({ tracks })), 1);
  });

const sung = (score: Score.Score, lines: readonly string[]) =>
  align(score, 0, lines).lines.map((line) =>
    line.map((s) => `${s.text}${s.notes > 1 ? `_${s.notes}` : ''}`).join(' '),
  );

describe('align', () => {
  it.effect('holds a syllable over an even pair of short notes, off the strong beats', () =>
    Effect.gen(function* () {
      const score = yield* tune([
        [60, 1],
        [62, 0.5],
        [64, 0.5],
        [65, 2],
        [67, 1],
        [69, 1],
        [67, 1],
        [65, 1],
        [64, 2],
        [60, 2],
      ]);
      expect(sung(score, ['God is love; sweet love is near to me.'])).toEqual([
        'God is_2 love; sweet love is near to me.',
      ]);
    }),
  );

  it.effect('sings a word shorter where the tune has fewer notes, cut again for print', () =>
    Effect.gen(function* () {
      const score = yield* tune([
        [60, 1],
        [62, 1],
        [64, 1],
        [65, 1],
        [67, 1],
        [65, 1],
        [64, 1],
        [62, 1],
        [60, 4],
      ]);
      const aligned = align(score, 0, ['O glorious King, now we sing Thy praise.']);
      expect(sung(score, ['O glorious King, now we sing Thy praise.'])).toEqual([
        'O glo rious King, now we sing Thy praise.',
      ]);
      expect(aligned.shared).toEqual({ inWord: 1, acrossWords: 0 });
      expect(aligned.melismas).toBe(0);
    }),
  );

  it.effect('starts each line after the long note that ends the line before', () =>
    Effect.gen(function* () {
      const score = yield* tune([
        [67, 1],
        [69, 1],
        [71, 1],
        [72, 2],
        [67, 1],
        [69, 0.5],
        [71, 0.5],
        [72, 1],
        [71, 1],
        [69, 1],
        [67, 4],
      ]);
      expect(sung(score, ['Lift up your voice', 'And sing His praise again.'])).toEqual([
        'Lift up your voice',
        'And sing_2 His praise a gain.',
      ]);
    }),
  );
});
