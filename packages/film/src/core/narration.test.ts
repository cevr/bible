import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { layout } from './layout.ts';
import type { Timings } from './schema.ts';

/** No recorded takes: every scene is estimated. */
const noTakes: Timings = { voice: '', scenes: {} };
import { estimate, hashText, parse, voiceFor, wordsFromAlignment } from './narration.ts';

describe('narration', () => {
  test('marks are removed from speech and point at the next word', () => {
    const p = parse('God {speak}spoke, and {so}it was so.');
    expect(p.spoken).toBe('God spoke, and it was so.');
    expect(p.marks.get('speak')).toBe(1);
    expect(p.marks.get('so')).toBe(3);
  });

  test('a duplicate mark is an authoring error', () => {
    expect(() => parse('{a}one {a}two')).toThrow('duplicate mark');
  });

  test("alignment characters regroup into the script's words", () => {
    const text = 'Look and live.';
    const chars = [...text];
    const starts = chars.map((_, i) => i * 0.1);
    const ends = chars.map((_, i) => i * 0.1 + 0.1);
    const words = Result.getOrThrow(wordsFromAlignment(text, chars, starts, ends));
    expect(words.map((w) => w.text)).toEqual(['Look', 'and', 'live.']);
    expect(words[2]?.start).toBeCloseTo(0.9);
  });

  test('an alignment that regroups into other words is a typed failure', () => {
    const r = wordsFromAlignment('Look and live.', [...'Lookandlive.'], [], []);
    expect(Result.isFailure(r) && r.failure._tag).toBe('AlignmentMismatch');
  });

  test('a take is used only while its text is unchanged', () => {
    const spoken = 'Look and live.';
    const take = { hash: hashText(spoken), file: 'a.mp3', duration: 2, words: estimate(spoken) };
    const timings = { voice: 'v', scenes: { s: take } };
    expect(voiceFor('s', 'Look and {live}live.', timings).recorded).toBe(true);
    expect(voiceFor('s', 'Look and die.', timings).recorded).toBe(false);
  });

  test('scenes are laid end to end and sized by their speech', () => {
    const draw = () => {};
    const placed = layout(
      [
        { id: 'a', say: 'One two three.', lead: 0.5, tail: 1, draw },
        { id: 'b', min: 4, draw },
      ],
      noTakes,
    );
    const a = placed[0];
    const b = placed[1];
    expect(a?.start).toBe(0);
    expect(a?.dur).toBeCloseTo(0.5 + (a?.voice.duration ?? 0) + 1);
    expect(b?.start).toBeCloseTo(a?.dur ?? 0);
    expect(b?.dur).toBe(4);
  });
});

import { ease, progress } from './time.ts';

describe('time', () => {
  test('eases are exactly 0 before their start and 1 after', () => {
    for (const e of Object.values(ease)) {
      expect(progress(0, 1, 1, e)).toBe(0);
      expect(progress(3, 1, 1, e)).toBe(1);
    }
  });
});
