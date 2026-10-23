import { describe, expect, it } from 'bun:test';

import * as Timing from '@bible/hymnal/timing';
import { type Hymn, sung } from '@bible/hymnal/hymn';
import { Array as Arr, Option } from 'effect';
import bundled from 'virtual:hymnal-timing';

import { readHymns } from '../../vite/words';
import { type Place, type Timeline, placeAt, timelineOf, timingBook } from './timeline';

const decoded = (encoded: string): Timeline => Option.getOrThrow(timelineOf(encoded));

// Two lines: a lit line of two words (syllables at 1000, 1500 | 2000) and a line marked whole.
const small = decoded('1,1000,2000,0.500,500;3,2000,1000');

/** The place by a plain scan of every line and syllable: what `placeAt` must agree with. */
const scanned = (timeline: Timeline, ms: number): Pick<Place, 'line' | 'syllable' | 'word'> => {
  const line = timeline.lines.findLastIndex((l) => l.start <= ms && ms < l.until);
  if (line < 0 || ms >= timeline.end) return { line: -1, syllable: -1, word: -1 };
  const syllables = timeline.lines[line]?.syllables ?? [];
  const syllable = syllables.findLastIndex((start) => start <= ms);
  return { line, syllable, word: timeline.lines[line]?.words[syllable] ?? -1 };
};

describe('a hymn timeline', () => {
  it('decodes lines, words and flags from the bundled string', () => {
    expect(small).toEqual({
      first: 1000,
      end: 4000,
      lines: [
        {
          start: 1000,
          until: 3000,
          played: true,
          even: false,
          syllables: [1000, 1500, 2000],
          words: [0, 0, 1],
        },
        { start: 3000, until: 4000, played: true, even: true, syllables: [], words: [] },
      ],
    });
  });

  it('refuses a string that does not decode', () => {
    for (const bad of ['', '1,0', '4,0,10', '1,-1,10', '1,0,10,0.x', '1,0,10;;'])
      expect(Option.isNone(timelineOf(bad))).toBe(true);
  });

  it('places nothing before the first line and from the end on', () => {
    expect(placeAt(small, 0)).toEqual({ line: -1, syllable: -1, word: -1, nextAt: 1000 });
    expect(placeAt(small, 4000)).toEqual({ line: -1, syllable: -1, word: -1, nextAt: Infinity });
  });

  it('places the syllable and its word, and when they next change', () => {
    expect(placeAt(small, 1000)).toEqual({ line: 0, syllable: 0, word: 0, nextAt: 1500 });
    expect(placeAt(small, 1700)).toEqual({ line: 0, syllable: 1, word: 0, nextAt: 2000 });
    expect(placeAt(small, 2999)).toEqual({ line: 0, syllable: 2, word: 1, nextAt: 3000 });
    expect(placeAt(small, 3000)).toEqual({ line: 1, syllable: -1, word: -1, nextAt: 4000 });
  });

  it('decodes each hymn once, and none for a hymn it does not carry', () => {
    const book = timingBook([[1, '1,0,10']]);
    expect(book.of(1)).toBe(book.of(1));
    expect(Option.isNone(book.of(2))).toBe(true);
  });
});

/** Where hymn `hymn`'s timeline differs from its compiled timing, line by line. */
const faultsOf = (hymn: Hymn, timeline: Timeline): ReadonlyArray<string> => {
  const timing = Option.getOrThrow(Option.fromUndefinedOr(hymn.timing));
  const seconds = Timing.secondsAt(timing);
  const ms = (time: number) => Math.round(seconds(time) * 1000);
  const lines = sung(hymn);
  if (timeline.lines.length !== lines.length || timing.lines.length !== lines.length)
    return [`${hymn.number}: line count`];
  const same = (a: ReadonlyArray<number>, b: ReadonlyArray<number>) =>
    a.length === b.length && a.every((x, k) => x === b[k]);
  return Arr.zip(Arr.zip(lines, timing.lines), timeline.lines).flatMap(([[line, want], got], i) => {
    const at = `${hymn.number} line ${i}`;
    const flags = [want.played, want.even].join() === [got.played, got.even].join();
    if (!flags || !same([got.start, got.until], [ms(want.start), ms(want.until)]))
      return [`${at}: times or flags`];
    const lit =
      want.played && !want.even && line.part._tag === 'Sung' && line.part.level === 'syllable';
    if (!lit || line.part._tag !== 'Sung') {
      if (got.syllables.length === 0) return [];
      return [`${at}: lit where words may not be`];
    }
    const syllables = line.part.lines[line.line] ?? [];
    // Syllables of one word share a word; each new word takes the next place.
    let word = -1;
    const words = syllables.map((s, k) => (word += Number(s.word !== syllables[k - 1]?.word)));
    if (!same(got.syllables, want.syllables.map(ms))) return [`${at}: syllable times`];
    if (!same(got.words, words)) return [`${at}: words`];
    return [];
  });
};

/** Where `placeAt` on `timeline` at `ms` differs from a scan, or does not hold until its `nextAt`. */
const placeFaults = (timeline: Timeline, ms: number, place: Place): ReadonlyArray<string> => {
  const want = scanned(timeline, ms);
  const faults: Array<string> = [];
  if (place.line !== want.line || place.syllable !== want.syllable || place.word !== want.word)
    faults.push(
      `at ${ms}: placed ${place.line}/${place.syllable}, scan ${want.line}/${want.syllable}`,
    );
  if (!(place.nextAt > ms)) faults.push(`at ${ms}: next ${place.nextAt}`);
  if (Number.isFinite(place.nextAt)) {
    const held = placeAt(timeline, place.nextAt - 1);
    if (held.line !== place.line || held.syllable !== place.syllable)
      faults.push(`at ${ms}: changed before ${place.nextAt}`);
  }
  return faults;
};

describe('every bundled hymn timeline', () => {
  const hymns = readHymns();
  const timelines = new Map(bundled.map(([number, encoded]) => [number, decoded(encoded)]));

  it('carries one line per sung line, at the compiled times, lit only where words may be', () => {
    expect(timelines.size).toBe(hymns.length);
    const faults = hymns.flatMap((hymn) =>
      Option.match(Option.fromUndefinedOr(timelines.get(hymn.number)), {
        onNone: () => [`${hymn.number}: no timeline`],
        onSome: (timeline) => faultsOf(hymn, timeline),
      }),
    );
    expect(faults).toEqual([]);
  });

  it('places every line start, the ms before it, every syllable, 0 and past the end as a scan does, in order', () => {
    const faults: Array<string> = [];
    let checked = 0;
    for (const [number, timeline] of timelines) {
      const times = [
        0,
        timeline.end + 1000,
        ...timeline.lines.flatMap((line) => [line.start, line.start - 1, ...line.syllables]),
      ].toSorted((a, b) => a - b);
      let last = { line: -1, syllable: -1 };
      for (const ms of times) {
        const place = placeAt(timeline, ms);
        faults.push(...placeFaults(timeline, ms, place).map((fault) => `${number} ${fault}`));
        // Monotone up to the end: never back to an earlier line or syllable.
        const back =
          place.line < last.line || (place.line === last.line && place.syllable < last.syllable);
        if (ms < timeline.end && place.line >= 0) {
          if (back) faults.push(`${number} at ${ms}: back`);
          last = place;
        }
        checked += 1;
      }
    }
    expect(faults.slice(0, 10)).toEqual([]);
    expect(checked).toBeGreaterThan(100_000);
  });
});
