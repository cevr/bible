// Every series script lists its cast (series README, "Every script lists its
// cast"): the concept stage draws its cast sheets from that list. The scripts
// written before the rule are named here; the list only shrinks, so a script
// given its cast must leave it.

import { describe, expect, it } from 'effect-bun-test';
import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem } from 'effect';

const BEFORE_THE_RULE = [
  'series/country/scripts/01-adams-schoolroom.md',
  'series/education/scripts/01-what-is-school-for.md',
  'series/education/scripts/17-did-jesus-go-to-school.md',
  'series/education/scripts/19-daniels-education.md',
  'series/education/scripts/44-should-kids-compete-for-grades.md',
  'series/education/scripts/52-three-ways-to-make-a-child-obey.md',
  'series/health/scripts/01-the-lord-that-healeth-thee.md',
  'series/health/scripts/06-the-breath-he-gave.md',
  'series/health/scripts/20-rest-a-while.md',
  'series/health/scripts/33-ten-days-in-babylon.md',
  'series/health/scripts/50-figs-for-a-king.md',
  'series/theology/scripts/01-milk-and-meat.md',
  'series/theology/scripts/02-the-oracles-of-god.md',
  'series/theology/scripts/03-god-is-love.md',
  'series/theology/scripts/05-the-word-made-flesh.md',
  'series/theology/scripts/18b-righteousness-by-faith.md',
];

const hasCast = (text: string) => text.split('\n').some((line) => line.trim() === '## Cast');

describe('the series scripts', () => {
  it.effect('every script lists its cast, or was written before the rule', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const series = yield* fs.readDirectory('series');
      const scripts: Array<string> = [];
      for (const name of series) {
        if ((yield* fs.stat(`series/${name}`)).type !== 'Directory') continue;
        const folder = `series/${name}/scripts`;
        if (!(yield* fs.exists(folder))) continue;
        for (const file of yield* fs.readDirectory(folder)) {
          if (file.endsWith('.md')) scripts.push(`${folder}/${file}`);
        }
      }
      const read = yield* Effect.forEach(scripts, (path) =>
        Effect.map(fs.readFileString(path), (text) => ({ path, cast: hasCast(text) })),
      );
      const missing = read
        .filter((s) => !s.cast && !BEFORE_THE_RULE.includes(s.path))
        .map((s) => s.path);
      const listedButCast = read
        .filter((s) => s.cast && BEFORE_THE_RULE.includes(s.path))
        .map((s) => s.path);
      const listedButGone = BEFORE_THE_RULE.filter((path) => !scripts.includes(path));
      expect({ missing, listedButCast, listedButGone }).toEqual({
        missing: [],
        listedButCast: [],
        listedButGone: [],
      });
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
