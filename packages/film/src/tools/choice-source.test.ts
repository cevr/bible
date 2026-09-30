// Where a pick and a level land in a film's source: `play` of the score in
// `sound.ts` and of a look in `palette.ts`, and a sound layer's level (its
// own number, the constant layers share, one added where it was left out),
// each the one literal the parser finds, the rest of the file untouched; and
// what is refused rather than guessed (a level other layers share, one that
// is computed, a bed that no longer plays the sound its knob was listed for).

import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import {
  SCORE_PLAY,
  editLevel,
  editPick,
  levelPointId,
  levelTargetOf,
  lookPlay,
  readLevel,
  readPick,
} from './choice-source.ts';

const SOUND = `import type { Sound } from '@bible/film/core';

const PAPER = -24;

export const sound: Sound = {
  score: { play: 'piano', under: -18, options: { piano: {}, strings: {} } },
  beds: [
    { sound: 'room.paper', level: PAPER, from: { scene: 'a' } },
    { sound: 'amb.hall', level: -30, from: { scene: 'b' } },
    { sound: 'amb.wind', from: { scene: 'c' } },
    { sound: 'amb.rain', level: PAPER - 2, from: { scene: 'd' } },
  ],
  effects: {
    page: { sound: 'tone.chime', level: -20, at: [{ scene: 'a' }] },
  },
};
`;

const PALETTE = `export const looks = {
  ground: { options: { now: 0, light: 0.5 }, play: 'now' },
} as const;
`;

const ok = <A, E>(result: Result.Result<A, E>): A => Result.getOrThrow(result);

const bed = (index: number, sound: string) =>
  ({ _tag: 'Layer', layer: { _tag: 'Bed', index, sound } }) as const;

describe('a pick', () => {
  test("changes only the score's `play`", () => {
    expect(ok(readPick('sound.ts', SOUND, SCORE_PLAY))).toBe('piano');
    const after = ok(editPick('sound.ts', SOUND, SCORE_PLAY, 'strings'));
    expect(after).toBe(SOUND.replace("play: 'piano'", "play: 'strings'"));
  });

  test("changes only a look's `play` in palette.ts", () => {
    const after = ok(editPick('palette.ts', PALETTE, lookPlay('ground'), 'light'));
    expect(after).toBe(PALETTE.replace("play: 'now'", "play: 'light'"));
    expect(Result.isFailure(readPick('palette.ts', PALETTE, lookPlay('sky')))).toBe(true);
  });
});

describe('a level', () => {
  test('a layer of its own is rewritten in place', () => {
    const target = { _tag: 'Layer', layer: { _tag: 'Effect', name: 'page' } } as const;
    const after = ok(editLevel('sound.ts', SOUND, target, -16));
    expect(after).toBe(SOUND.replace('level: -20', 'level: -16'));
    expect(ok(readLevel('sound.ts', after, target.layer))).toEqual({ _tag: 'Own', value: -16 });
  });

  test('the constant layers share is one knob: its literal changes for all of them', () => {
    expect(ok(readLevel('sound.ts', SOUND, bed(0, 'room.paper').layer))).toEqual({
      _tag: 'Shared',
      name: 'PAPER',
      value: -24,
    });
    const after = ok(editLevel('sound.ts', SOUND, { _tag: 'Const', name: 'PAPER' }, -20));
    expect(after).toBe(SOUND.replace('const PAPER = -24;', 'const PAPER = -20;'));
    // Through one of its layers it is refused: the others would move too.
    const through = editLevel('sound.ts', SOUND, bed(0, 'room.paper'), -20);
    expect(Result.isFailure(through)).toBe(true);
  });

  test('a level left out is added after the last key; one computed is refused', () => {
    const after = ok(editLevel('sound.ts', SOUND, bed(2, 'amb.wind'), -28));
    expect(ok(readLevel('sound.ts', after, bed(2, 'amb.wind').layer))).toEqual({
      _tag: 'Own',
      value: -28,
    });
    expect(Result.isFailure(editLevel('sound.ts', SOUND, bed(3, 'amb.rain'), -20))).toBe(true);
  });

  test('a bed that no longer plays the sound its knob was listed for is refused', () => {
    expect(Result.isFailure(editLevel('sound.ts', SOUND, bed(1, 'amb.wind'), -20))).toBe(true);
    expect(Result.isFailure(editLevel('sound.ts', SOUND, bed(9, 'amb.hall'), -20))).toBe(true);
  });

  test('a point id names its target and reads back', () => {
    for (const target of [
      bed(3, 'amb.hall'),
      { _tag: 'Layer', layer: { _tag: 'Effect', name: 'gavel' } } as const,
      { _tag: 'Layer', layer: { _tag: 'Score', which: 'under' } } as const,
      { _tag: 'Const', name: 'PAPER' } as const,
    ])
      expect(levelTargetOf(levelPointId(target))).toEqual(Option.some(target));
    expect(levelTargetOf('take:paper.page')).toEqual(Option.none());
    expect(levelTargetOf('level:bed:x:amb')).toEqual(Option.none());
  });
});
