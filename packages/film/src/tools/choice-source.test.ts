// Where a pick lands in a film's source: `play` of the score in `sound.ts`
// and of a look in `palette.ts`, each the one literal the parser finds, the
// rest of the file untouched; and a palette's looks and their levels, read.

import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { SCORE_PLAY, editPick, lookLevels, lookPlay, readPick } from './choice-source.ts';

const SOUND = `import type { Sound } from '@bible/film/core';

export const sound: Sound = {
  score: { play: 'piano', under: -18, options: { piano: {}, strings: {} } },
  beds: [{ sound: 'amb.hall', level: -30, from: { scene: 'b', at: 'start' } }],
};
`;

const PALETTE = `export const looks = {
  ground: { options: { now: 0, light: 0.5 }, play: 'now' },
} as const;
`;

const ok = <A, E>(result: Result.Result<A, E>): A => Result.getOrThrow(result);

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

  test("a palette's looks and their levels, as written; none without a looks export", () => {
    expect([...ok(lookLevels('palette.ts', PALETTE)).entries()]).toEqual([
      ['ground', ['now', 'light']],
    ]);
    expect(ok(lookLevels('palette.ts', 'export const palette = {};\n')).size).toBe(0);
    const spread = 'export const looks = { ...others, ground: { options: {}, play: "x" } };\n';
    expect(Result.isFailure(lookLevels('palette.ts', spread))).toBe(true);
  });
});
