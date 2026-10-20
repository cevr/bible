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

// Every episode a series plan builds on or points to has its entry block in
// that plan: a line that opens `**NN · Title**`, NN two digits and a letter
// for an episode put in between (02b). The numbers read are each "Builds on"
// line's, from its label to the next bold label, and each arrow's (→ 51,
// → **52, 57**). In a "Builds on" line a code span, a date and a number after
// a word with a capital (a book or a refcode: Gen 2:7, Ex 34, PP 60.3) are set
// aside first, so a number written straight after such a word is never read
// as an episode. A range (14–18) is read at its two ends: a number inside one
// may stand empty until the list is renumbered. A plan is checked when it
// holds entry blocks and names at least one number; the theology plan must be
// among those checked, so a reader that finds nothing fails. The references
// known to be stale are named here as `<plan>: <number>`; the list only
// shrinks, so a reference made good must leave it.
const KNOWN_STALE: ReadonlyArray<string> = [];

/** An entry block's number, where its line opens: `**11b · …`. */
const ENTRY = /(?<=^\*\*)\d{2}[a-z]?(?= · )/gmu;
/** A "Builds on" line's words, from its label to the next bold label or the line's end. */
const BUILDS_ON = /(?<=\*\*Builds on:\*\*)[^\n]*?(?=\*\*|$)/gmu;
/** The numbers an arrow points to: `→ 51`, `→ **52, 57**`. */
const ARROW = /(?<=→ ?(?:\*\*)?)\d{2}[a-z]?(?:, \d{2}[a-z]?)*/gu;
/** In a "Builds on" line, what is no episode number: a code span, a date, a number after a word with a capital. */
const NOT_AN_EPISODE =
  /`[^`\n]*`|\b\d{4}-\d{2}-\d{2}\b|(?:\b[1-3] )?\b[A-Z][A-Za-z]*\.? \d+(?:[:.]\d+)*(?:[–-]\d+(?:[:.]\d+)*)?/gu;
/** An episode number: two digits and maybe a letter, with no digit, letter, verse or decimal joined to it. */
const EPISODE = /(?<![\w.:])\d{2}[a-z]?(?![\w:]|\.\d)/gu;

/** A number a plan builds on or points to, and the line it stands on. */
interface Reference {
  readonly line: number;
  readonly episode: string;
}

/** A reference with no entry block: as KNOWN_STALE names it, and where it stands. */
interface Dangling {
  readonly listed: string;
  readonly where: string;
}

const matchesIn = (text: string, pattern: RegExp): ReadonlyArray<string> =>
  Array.from(text.matchAll(pattern), (found) => found[0]);

/** The episode numbers each line of a plan builds on or points to, once a line. */
const referencesIn = (plan: string): ReadonlyArray<Reference> =>
  plan.split('\n').flatMap((text, index) => {
    const read = [
      ...matchesIn(text, BUILDS_ON).map((words) => words.replace(NOT_AN_EPISODE, ' ')),
      ...matchesIn(text, ARROW),
    ];
    const episodes = new Set(read.flatMap((words) => matchesIn(words, EPISODE)));
    return Array.from(episodes, (episode) => ({ line: index + 1, episode }));
  });

describe('the series plans', () => {
  it.effect('every episode a plan builds on or points to has its entry block', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const checked: Array<string> = [];
      const dangling: Array<Dangling> = [];
      for (const name of yield* fs.readDirectory('series')) {
        if ((yield* fs.stat(`series/${name}`)).type !== 'Directory') continue;
        const path = `series/${name}/series.md`;
        if (!(yield* fs.exists(path))) continue;
        const plan = yield* fs.readFileString(path);
        const entries = new Set(matchesIn(plan, ENTRY));
        const references = referencesIn(plan);
        if (entries.size === 0 || references.length === 0) continue;
        checked.push(path);
        for (const { line, episode } of references) {
          if (entries.has(episode)) continue;
          dangling.push({
            listed: `${path}: ${episode}`,
            where: `${path}:${line} names ${episode}, which has no entry block`,
          });
        }
      }
      const unlisted = dangling
        .filter((reference) => !KNOWN_STALE.includes(reference.listed))
        .map((reference) => reference.where);
      const listedButMadeGood = KNOWN_STALE.filter(
        (listed) => !dangling.some((reference) => reference.listed === listed),
      );
      expect(checked).toContain('series/theology/series.md');
      expect({ unlisted, listedButMadeGood }).toEqual({ unlisted: [], listedButMadeGood: [] });
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
