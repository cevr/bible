// Every series script lists its cast (series README, "Every script lists its
// cast"): the concept stage draws its cast sheets from that list.

import { describe, expect, it } from 'effect-bun-test';
import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Option } from 'effect';

const hasCast = (text: string) => text.split('\n').some((line) => line.trim() === '## Cast');

describe('the series scripts', () => {
  it.effect('every script lists its cast', () =>
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
      expect(scripts.length).toBeGreaterThan(0);
      expect(read.filter((s) => !s.cast).map((s) => s.path)).toEqual([]);
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

// A script's place in its series is true. Where a series plan holds entry
// blocks (`**NN · Title**`), each of its scripts opens on its own entry's
// heading (`# NN · Title`, the same number and the same title), and its
// `Series:` line states its place as one segment `N of M` (`· 3 of 44 ·`):
// N its entry's place in the plan, counted from 1, and M the plan's entry
// blocks. The plan's own entries run 01 to M, in order, with no letter and
// no empty slot. A plan with no entry blocks (the talk series list theirs in
// tables) holds no script to it.

/** An entry block's number and title, where its line opens: `**03 · As It Reads**`. */
const ENTRY_TITLE = /^\*\*(\d{2}[a-z]?) · (.+?)\*\*/gmu;
/** A script's own heading, two digits and no letter: `# 03 · As It Reads`. */
const HEADING = /^# (\d{2}) · (.+)$/mu;
/** A script's header line that names its series and its place. */
const SERIES_LINE = /^Series: (.+)$/mu;
/** A place in a series: `3 of 44`. */
const PLACE = /^(\d+) of (\d+)$/u;

/** What is untrue in `plan`'s numbering: its entries run 01 to their count, in order, no letter. */
const planFaults = (
  plan: string,
  entries: ReadonlyArray<readonly [string, string]>,
): ReadonlyArray<string> => {
  const numbers = entries.map(([number]) => number).join(' ');
  const counted = entries.map((_, i) => String(i + 1).padStart(2, '0')).join(' ');
  return [`${plan}: its entries are numbered ${numbers}, not 01 to ${entries.length}`].filter(
    () => numbers !== counted,
  );
};

/** What is untrue in `script`'s heading or place against its plan's `entries`. */
const placeFaults = (
  path: string,
  script: string,
  entries: ReadonlyArray<readonly [string, string]>,
): ReadonlyArray<string> =>
  Option.match(Option.fromNullishOr(HEADING.exec(script)), {
    onNone: () => [`${path}: no "# NN · Title" heading, two digits and no letter`],
    onSome: ([, number = '', title = '']) => {
      const at = entries.findIndex(([n]) => n === number);
      const entry = Option.fromUndefinedOr(entries[at]);
      if (Option.isNone(entry)) return [`${path}: ${number} has no entry block in its plan`];
      const [, planned] = entry.value;
      const faults: Array<string> = [];
      if (planned !== title.trim()) {
        faults.push(`${path}: its heading says "${title.trim()}", its entry "${planned}"`);
      }
      const line = Option.getOrElse(Option.fromNullishOr(SERIES_LINE.exec(script)?.[1]), () => '');
      const places = line
        .split(' · ')
        .flatMap((segment) => Option.toArray(Option.fromNullishOr(PLACE.exec(segment.trim()))));
      const place = Option.filter(Option.fromUndefinedOr(places[0]), () => places.length === 1);
      if (Option.isNone(place)) {
        faults.push(`${path}: its Series line states its place ${places.length} times, not once`);
      } else if (place.value[1] !== String(at + 1) || place.value[2] !== String(entries.length)) {
        faults.push(
          `${path}: says ${place.value[0]}, its plan makes it ${at + 1} of ${entries.length}`,
        );
      }
      return faults;
    },
  });

describe('the series scripts against their plans', () => {
  it.effect("every script's heading and place are its plan's", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const checked: Array<string> = [];
      const faults: Array<string> = [];
      for (const name of yield* fs.readDirectory('series')) {
        if ((yield* fs.stat(`series/${name}`)).type !== 'Directory') continue;
        const plan = `series/${name}/series.md`;
        const folder = `series/${name}/scripts`;
        if (!(yield* fs.exists(plan)) || !(yield* fs.exists(folder))) continue;
        const entries = Array.from(
          (yield* fs.readFileString(plan)).matchAll(ENTRY_TITLE),
          ([, number = '', title = '']) => [number, title.trim()] as const,
        );
        if (entries.length === 0) continue;
        faults.push(...planFaults(plan, entries));
        for (const file of yield* fs.readDirectory(folder)) {
          if (!file.endsWith('.md')) continue;
          const path = `${folder}/${file}`;
          checked.push(path);
          faults.push(...placeFaults(path, yield* fs.readFileString(path), entries));
        }
      }
      expect(checked).toContain('series/theology/scripts/01-in-its-order.md');
      expect(faults).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
