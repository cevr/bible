// Every rule section the judge and the critique quote is in its file: a
// heading renamed or renumbered (CRAFT.md's rules are numbered) fails here,
// naming it, before a judge's run or a critic's build refuses it.

import { describe, expect, it } from 'effect-bun-test';
import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem } from 'effect';
import { CRITIQUE_RULES, JUDGE_RULES } from './rules.ts';

describe('the rules the counsels quote', () => {
  it.effect('every heading is a section of its file', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const read = yield* Effect.forEach([...JUDGE_RULES, ...CRITIQUE_RULES], (rule) =>
        Effect.map(fs.readFileString(rule.file), (text) => ({ rule, lines: text.split('\n') })),
      );
      // A line that is the heading, trimmed: as the judge's and the critic's `sectionOf` finds it.
      const missing = read
        .filter(({ rule, lines }) => !lines.some((line) => line.trim() === rule.heading.trim()))
        .map(({ rule }) => `${rule.file}: ${rule.heading}`);
      expect(missing).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
