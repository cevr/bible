import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { layout } from '../core/layout.ts';
import {
  type BenchReport,
  benchFrames,
  filmFrames,
  hashFrames,
  judge,
  median,
  medianPerFrame,
  summarize,
  workersRow,
} from './bench.ts';

/** Three scenes: a 0–4 s, b 4–9 s, c 9–15 s, at 10 fps. */
const placed = layout(
  [
    { id: 'a', min: 4 },
    { id: 'b', min: 5 },
    { id: 'c', min: 6 },
  ],
  { voice: '', scenes: {} },
);
const all = filmFrames(placed, 10, 150);

const report = (scenes: ReadonlyArray<[string, number]>, extra: Partial<BenchReport> = {}) => {
  const rows = scenes.map(([id, ms]) => ({
    id,
    frames: 100,
    sampled: 10,
    medianMs: ms,
    p95Ms: ms,
    meanMs: ms,
    costSec: ms / 10,
  }));
  const base: BenchReport = {
    film: 'test',
    machine: { cpu: 'M', cores: 12 },
    at: '2026-09-27T00:00:00.000Z',
    every: 10,
    runs: 3,
    sampled: 30,
    drawSec: rows.reduce((sum, r) => sum + r.costSec, 0),
    medianMs: 0,
    captions: true,
    scenes: rows,
  };
  return { ...base, ...extra };
};

describe('bench frames', () => {
  test('every frame belongs to the scene playing at it', () => {
    expect(all).toHaveLength(150);
    expect([all[0]?.scene, all[39]?.scene, all[40]?.scene, all[89]?.scene, all[90]?.scene]).toEqual(
      ['a', 'a', 'b', 'b', 'c'],
    );
  });

  test('samples every nth frame, in the scenes asked for', () => {
    expect(benchFrames(all, 50, Option.none()).map((f) => f.frame)).toEqual([0, 50, 100]);
    expect(benchFrames(all, 20, Option.some(new Set(['b']))).map((f) => f.frame)).toEqual([
      40, 60, 80,
    ]);
  });

  test('hashes every 30th frame, whatever the timing step', () => {
    expect(hashFrames(all, Option.none())).toEqual([0, 30, 60, 90, 120]);
  });
});

describe('summary', () => {
  test('median of each frame over the runs', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(
      medianPerFrame([
        [10, 20],
        [30, 10],
        [20, 90],
      ]),
    ).toEqual([20, 20]);
  });

  test("per scene in film order, its cost over all of the scene's frames", () => {
    const timed = benchFrames(all, 10, Option.none()).map((f) => ({
      ...f,
      ms: 10 + 10 * Number(f.scene === 'b'),
    }));
    const scenes = summarize(timed, all);
    expect(scenes.map((s) => [s.id, s.frames, s.sampled, s.medianMs])).toEqual([
      ['a', 40, 4, 10],
      ['b', 50, 5, 20],
      ['c', 60, 6, 10],
    ]);
    // b: 20 ms × 50 frames.
    expect(scenes[1]?.costSec).toBeCloseTo(1, 9);
  });

  test('a worker count reports its median run as fps', () => {
    expect(workersRow(6, true, 3600, [40, 36, 38])).toMatchObject({ medianSec: 38 });
    expect(workersRow(6, true, 3600, [40, 36, 38]).fps).toBeCloseTo(3600 / 38, 9);
  });
});

describe('budget', () => {
  const baseline = report([
    ['a', 30],
    ['b', 40],
    ['tiny', 1],
  ]);

  test('within 10% of the baseline passes', () => {
    expect(
      judge(
        report([
          ['a', 32],
          ['b', 43],
          ['tiny', 1],
        ]),
        baseline,
      ),
    ).toEqual({ _tag: 'Compared', slower: [], moved: [], unhashed: false });
  });

  test('a scene more than 10% slower fails, and the film with it when its sum is over', () => {
    const verdict = judge(
      report([
        ['a', 30],
        ['b', 60],
        ['tiny', 1.9],
      ]),
      baseline,
    );
    expect(verdict).toEqual({
      _tag: 'Compared',
      slower: [
        { what: 'film', now: 9.19, before: 7.1 },
        { what: 'b', now: 60, before: 40 },
      ],
      moved: [],
      unhashed: false,
    });
  });

  test('a scene under the floor never fails, however much slower', () => {
    const verdict = judge(
      report([
        ['a', 30],
        ['b', 40],
        ['tiny', 1.9],
      ]),
      baseline,
    );
    expect(verdict).toMatchObject({ slower: [] });
  });

  test('a run over some scenes compares those scenes but not the film', () => {
    const verdict = judge(report([['b', 50]]), baseline);
    expect(verdict).toMatchObject({ slower: [{ what: 'b' }] });
  });

  test('frames whose pixels moved are listed', () => {
    const verdict = judge(
      report([['a', 30]], { hashes: { '0': 'x', '30': 'y', '60': 'z' } }),
      report([['a', 30]], { hashes: { '0': 'x', '30': 'q' } }),
    );
    expect(verdict).toMatchObject({ moved: [30] });
  });

  test('another machine is not compared', () => {
    const verdict = judge(report([['a', 90]], { machine: { cpu: 'Other', cores: 8 } }), baseline);
    expect(verdict).toEqual({
      _tag: 'Incomparable',
      reason: 'the baseline was measured on M ×12, this run on Other ×8',
    });
  });

  test('a baseline drawn with the other captions setting is not compared', () => {
    const verdict = judge(report([['a', 30]], { captions: false }), baseline);
    expect(verdict).toEqual({
      _tag: 'Incomparable',
      reason: 'the baseline was drawn with captions, this run without',
    });
  });

  test('a hashed run against a baseline without hashes compares no pixels, and says so', () => {
    const verdict = judge(report([['a', 30]], { hashes: { '0': 'x' } }), baseline);
    expect(verdict).toMatchObject({ moved: [], unhashed: true });
  });
});
