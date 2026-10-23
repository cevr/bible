import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { type Hymn, Hymn as HymnSchema, type Order, type Part, sung } from './hymn.js';
import { type Clock, type Laying, secondsAt, timingOf } from './timing.js';

const fit = { notes: 2, syllables: 2, melismas: 0, shared: { inWord: 0, acrossWords: 0 }, cost: 0 };

/** A sung part, one line per count, each of that many syllables. */
const sungPart = (...counts: [number, ...number[]]): Part => {
  const line = (count: number) => {
    const syllables = Array.from({ length: count }, (_, word) => ({
      text: 'la',
      word,
      notes: 1,
      beats: 1,
    }));
    const [first, ...rest] = syllables;
    return first === undefined
      ? ([{ text: 'la', word: 0, notes: 1, beats: 1 }] as const)
      : ([first, ...rest] as const);
  };
  const [head, ...tail] = counts;
  return { _tag: 'Sung', level: 'syllable', lines: [line(head), ...tail.map(line)], fit, why: [] };
};

const plainPart = (lines: number): Part => ({
  _tag: 'Plain',
  lines: ['words', ...Array.from({ length: lines - 1 }, () => 'words')],
  why: ['notes'],
});

const hymnOf = (stanzas: readonly Part[], refrain?: { order: Order; part: Part }): Hymn => ({
  version: 1,
  book: 'sdah-1985',
  number: 1,
  title: 'Test',
  key: { tonic: 'C', minor: false },
  meter: { numerator: 4, denominator: 4 },
  verses: { text: stanzas.length, midi: stanzas.length, exact: true },
  stanzas: [stanzas[0] ?? sungPart(2), ...stanzas.slice(1)],
  refrain,
});

// 96 ticks a beat, so a tick is one unit of the timing.
const clock: Clock = { ticksPerBeat: 96, tempos: [], lastTick: 320 };

/** Verse v's span, [100 + 100v, 200 + 100v): a stanza line at its start, a refrain line at +50. */
const verse = (v: number, extra: Partial<Laying> = {}): Laying => ({
  played: true,
  span: { start: 100 + 100 * v, end: 200 + 100 * v },
  stanza: 1,
  tail: 1,
  starts: [
    [100 + 100 * v, 120 + 100 * v],
    [150 + 100 * v, 170 + 100 * v],
  ],
  ...extra,
});

const outline = (hymn: Hymn, layings: readonly Laying[], at: Clock = clock) =>
  timingOf(hymn, at, layings).lines.map((line) => [line.start, line.until, line.played, line.even]);

const two = [sungPart(2), sungPart(2)];

describe('timingOf', () => {
  it.effect(
    'gives each refrain singing the refrain the file plays after the stanza before it',
    () =>
      Effect.sync(() => {
        const timing = timingOf(hymnOf(two, { order: 'after-each', part: sungPart(2) }), clock, [
          verse(0),
          verse(1),
        ]);
        expect(timing.lines).toEqual([
          { start: 100, until: 150, syllables: [100, 120], played: true, even: false },
          { start: 150, until: 200, syllables: [150, 170], played: true, even: false },
          { start: 200, until: 250, syllables: [200, 220], played: true, even: false },
          { start: 250, until: 320, syllables: [250, 270], played: true, even: false },
        ]);
        expect(timing).toMatchObject({ perBeat: 96, intro: 100, end: 320, tempos: [[0, 500_000]] });
      }),
  );

  it.effect('places a refrain sung first to end where the first stanza starts, unplayed', () =>
    Effect.sync(() => {
      const hymn = hymnOf(two, { order: 'first-and-after-each', part: sungPart(2) });
      expect(timingOf(hymn, clock, [verse(0), verse(1)]).lines[0]).toEqual({
        start: 50,
        until: 100,
        syllables: [50, 70],
        played: false,
        even: false,
      });
      // An intro shorter than the refrain: even shares from the file's start.
      const short = [
        verse(0, {
          span: { start: 30, end: 200 },
          starts: [
            [30, 40],
            [150, 170],
          ],
        }),
        verse(1),
      ];
      expect(timingOf(hymn, clock, short).lines[0]).toEqual({
        start: 0,
        until: 30,
        syllables: [0, 15],
        played: false,
        even: true,
      });
    }),
  );

  it.effect(
    'sings a before-each refrain on the verse before its stanza, the first in the intro',
    () =>
      Effect.sync(() => {
        const hymn = hymnOf(two, { order: 'before-each', part: sungPart(2) });
        expect(outline(hymn, [verse(0), verse(1)])).toEqual([
          [50, 100, false, false],
          [100, 150, true, false],
          [150, 200, true, false],
          [200, 320, true, false],
        ]);
      }),
  );

  it.effect('sings a first-and-last refrain in the intro and after the last stanza', () =>
    Effect.sync(() => {
      const hymn = hymnOf(two, { order: 'first-and-last', part: sungPart(2) });
      const layings = [verse(0, { tail: 0, starts: [[100, 120]] }), verse(1)];
      expect(outline(hymn, layings)).toEqual([
        [50, 100, false, false],
        [100, 200, true, false],
        [200, 250, true, false],
        [250, 320, true, false],
      ]);
    }),
  );

  it.effect('lays a stanza the file does not play after its end, on its last verse moved', () =>
    Effect.sync(() => {
      const hymn = hymnOf([...two, sungPart(2)], { order: 'after-each', part: sungPart(2) });
      const again = verse(1, {
        played: false,
        starts: [
          [205, 225],
          [255, 275],
        ],
      });
      const timing = timingOf(hymn, clock, [verse(0), verse(1), again]);
      expect(timing.lines.slice(3)).toEqual([
        { start: 250, until: 325, syllables: [250, 270], played: true, even: false },
        { start: 325, until: 375, syllables: [325, 345], played: false, even: false },
        { start: 375, until: 420, syllables: [375, 395], played: false, even: false },
      ]);
      expect(timing.end).toBe(320);
    }),
  );

  it.effect('gives a laying with no trusted notes even shares of its verse', () =>
    Effect.sync(() => {
      const hymn = hymnOf([plainPart(2), sungPart(2, 2)]);
      const layings = [
        { ...verse(0), stanza: 2, tail: 0, starts: undefined },
        { ...verse(1), stanza: 2, tail: 0, starts: undefined },
      ];
      expect(timingOf(hymn, clock, layings).lines).toEqual([
        { start: 100, until: 150, syllables: [], played: true, even: true },
        { start: 150, until: 200, syllables: [], played: true, even: true },
        { start: 200, until: 250, syllables: [200, 225], played: true, even: true },
        { start: 250, until: 320, syllables: [250, 275], played: true, even: true },
      ]);
    }),
  );

  it.effect(
    'gives a line whose syllables differ in number from its laid notes even shares of its time',
    () =>
      Effect.sync(() => {
        const hymn = hymnOf([sungPart(2)]);
        const layings = [{ ...verse(0), tail: 0, starts: [[100, 110, 130]] }];
        expect(timingOf(hymn, clock, layings).lines).toEqual([
          { start: 100, until: 320, syllables: [100, 150], played: true, even: true },
        ]);
      }),
  );

  it.effect('rounds to 1/96 beat and keeps the later of two tempos at one tick', () =>
    Effect.sync(() => {
      const at: Clock = {
        ticksPerBeat: 480,
        tempos: [
          { tick: 960, microsPerQuarter: 400_000 },
          { tick: 960, microsPerQuarter: 600_000 },
        ],
        lastTick: 1600,
      };
      const hymn = hymnOf([sungPart(2)]);
      const layings = [
        { ...verse(0), tail: 0, span: { start: 482, end: 1500 }, starts: [[482, 963]] },
      ];
      const timing = timingOf(hymn, at, layings);
      expect(timing.tempos).toEqual([
        [0, 500_000],
        [192, 600_000],
      ]);
      expect(timing.lines[0]?.syllables).toEqual([96, 193]);
      expect(timing.end).toBe(320);
    }),
  );
});

describe('secondsAt', () => {
  it.effect('reads each tempo from its time to the next', () =>
    Effect.sync(() => {
      const at = secondsAt({
        perBeat: 96,
        tempos: [
          [0, 500_000],
          [96, 1_000_000],
        ],
      });
      expect([at(0), at(48), at(96), at(192)]).toEqual([0, 0.25, 0.5, 1.5]);
    }),
  );
});

const FOLDER = new URL('../data/sdah-1985/', import.meta.url).pathname;
const decodeHymn = Schema.decodeUnknownEffect(Schema.fromJsonString(HymnSchema));

/** Why a committed hymn's timing breaks the rules, or nothing. */
const faults = (hymn: Hymn): string[] => {
  const timing = hymn.timing;
  if (timing === undefined) return ['no timing'];
  const out: string[] = [];
  const lines = sung(hymn);
  if (timing.lines.length !== lines.length)
    return [`${timing.lines.length} timed lines for ${lines.length} sung`];
  const firstOnly =
    hymn.refrain?.order === 'first-and-after-each' || hymn.refrain?.order === 'first-and-last';
  let stanza = 0;
  timing.lines.forEach((time, i) => {
    const line = lines[i];
    if (line === undefined) return;
    const at = `line ${i}`;
    if (line.verse !== 'refrain') stanza = line.verse;
    const before = timing.lines[i - 1];
    if (before !== undefined && time.start < before.start)
      out.push(`${at}: starts before the line before`);
    if (time.until < time.start) out.push(`${at}: ends before it starts`);
    if (time.syllables.some((s, k) => s < (time.syllables[k - 1] ?? time.start)))
      out.push(`${at}: a syllable starts before the one before`);
    if (time.syllables.some((s) => s < time.start || s >= time.until))
      out.push(`${at}: a syllable outside [start, until)`);
    if (line.part._tag === 'Sung') {
      const count = line.part.lines[line.line]?.length;
      if (time.syllables.length !== count)
        out.push(`${at}: ${time.syllables.length} syllables for ${count}`);
    } else if (!time.even || time.syllables.length > 0) out.push(`${at}: a Plain line not even`);
    const unplayed =
      stanza > hymn.verses.midi || (line.verse === 'refrain' && stanza === 0 && firstOnly);
    if (unplayed && time.played) out.push(`${at}: played, though the file does not play it`);
    if (time.played && time.until > timing.end) out.push(`${at}: played past the file's end`);
  });
  const last = timing.lines.at(-1);
  if (last !== undefined && last.played && last.until !== timing.end)
    out.push(`the last line ends at ${last.until}, not the file's end ${timing.end}`);
  if (last !== undefined && !last.played && last.until < timing.end)
    out.push(`the last line, unplayed, ends before the file's end`);
  return out;
};

describe('the committed timing', () => {
  it.effect('times every sung line of every hymn by the rules', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const names = (yield* fs.readDirectory(FOLDER)).filter((name) => /^\d{3}\.json$/.test(name));
      expect(names).toHaveLength(695);
      const hymns = yield* Effect.forEach(
        names,
        (name) => fs.readFileString(`${FOLDER}${name}`).pipe(Effect.flatMap(decodeHymn)),
        { concurrency: 16 },
      );
      const found = hymns.flatMap((hymn) =>
        faults(hymn).map((fault) => `${hymn.number}: ${fault}`),
      );
      expect(found.slice(0, 20)).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
