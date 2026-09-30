// The ending and the air (CRAFT rules 7 and 10): an ending too short for
// YouTube's end screens, and silence in the master that no cue declares.

import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { layout } from '../core/layout.ts';
import type { Timed } from '../core/schema.ts';
import { DEAD_MAX, deadAir, designedSilences, endShort, staticFindings } from './check.ts';
import { report } from './findings.ts';
import { holdScenes, holdTimings, testFilm } from './testing.ts';

/** No track on disk, and no plan key: what a check before any mix sees. */
const NO_MASTER = { master: Option.none(), key: Option.none() };

const WINDOW = 0.05;
/** `secs` of master at `db`, in `WINDOW` windows. */
const level = (db: number, secs: number) =>
  Array.from({ length: Math.round(secs / WINDOW) }, () => db);

describe('EndShort', () => {
  test('a film that ends on its last word has no tail and no end card', () => {
    const found = endShort(Result.getOrThrow(layout(holdScenes, holdTimings)));
    expect(found.map((f) => [f.part, f.secs])).toEqual([
      ['after the last word', expect.any(Number)],
      ['end card', 0],
    ]);
    expect(found[0]?.secs).toBeLessThan(20);
  });

  test('a silent last scene of 25 s is both the tail and the card', () => {
    const scenes: ReadonlyArray<Timed> = [...holdScenes, { id: 'end', min: 25 }];
    expect(endShort(Result.getOrThrow(layout(scenes, holdTimings)))).toEqual([]);
  });

  test('the check warns of it', () => {
    const film = testFilm(holdScenes, holdTimings);
    const placed = Result.getOrThrow(layout(holdScenes, holdTimings));
    const found = report(staticFindings(film, placed, NO_MASTER), { allowStale: false }).findings;
    expect(found.filter((r) => r.finding._tag === 'EndShort').map((r) => r.level)).toEqual([
      'warning',
      'warning',
    ]);
  });
});

describe('DeadAir', () => {
  const scenes: ReadonlyArray<Timed> = [
    {
      id: 'a',
      min: 6,
      timeline: {
        hush: { scene: 'start', offset: 1, dur: 2, silence: true },
        other: { scene: 'start', offset: 3, dur: 1 },
      },
    },
  ];

  test('a cue marked silence: true declares its span, and only it', () => {
    expect(designedSilences(Result.getOrThrow(layout(scenes, { voice: '', scenes: {} })))).toEqual([
      [1, 3],
    ]);
  });

  test('a quiet run over the limit is dead air, from its first quiet window', () => {
    const levels = [...level(-20, 1), ...level(-80, 2), ...level(-20, 1)];
    const found = deadAir(levels, WINDOW, []);
    expect(found).toHaveLength(1);
    expect(found[0]?.from).toBeCloseTo(1);
    expect(found[0]?.to).toBeCloseTo(3);
    expect(found[0]?.max).toBe(DEAD_MAX);
  });

  test('a quiet run the limit allows, or a designed silence covers, is not', () => {
    expect(deadAir([...level(-20, 1), ...level(-80, 1.4), ...level(-20, 1)], WINDOW, [])).toEqual(
      [],
    );
    const levels = [...level(-20, 1), ...level(-80, 2), ...level(-20, 1)];
    expect(deadAir(levels, WINDOW, [[1.2, 2.9]])).toEqual([]);
  });

  test('a designed silence inside a longer quiet run leaves what is left over', () => {
    const levels = [...level(-80, 6)];
    const found = deadAir(levels, WINDOW, [[1, 3]]);
    expect(found.map((f) => [f.from, f.to])).toEqual([[3, expect.closeTo(6)]]);
  });
});
