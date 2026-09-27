// Bencher with fakes: the page's times become the per-scene report, a baseline
// is kept on request, and a later run over its budget or with moved pixels
// fails. No Chromium.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option, Path, Schema } from 'effect';
import { BenchReport } from './bench.ts';
import { Bencher, type DrawBenchOptions } from './bencher.ts';
import { Renderer } from './renderer.ts';
import {
  type FakeRenderHost,
  emptyLedger,
  fakeRenderHost,
  memoryFileSystem,
  testFilm,
} from './testing.ts';

/** a 0–8 s, b 8–20 s: 600 frames at 30 fps. */
const film = testFilm(
  [
    { id: 'a', min: 8 },
    { id: 'b', min: 12 },
  ],
  { voice: '', scenes: {} },
);

const draw: DrawBenchOptions = {
  every: 30,
  runs: 3,
  scenes: Option.none(),
  hash: false,
  baseline: false,
  budget: false,
};

const setup = (files: Map<string, Uint8Array>, host: FakeRenderHost = {}) => {
  const ledger = emptyLedger();
  const layer = Bencher.layer.pipe(
    Layer.provide(Renderer.layer),
    Layer.provide([fakeRenderHost(ledger, host), memoryFileSystem(files), Path.layer]),
  );
  return {
    ledger,
    bench: (options: DrawBenchOptions) =>
      Effect.gen(function* () {
        return yield* (yield* Bencher).draw(film, options);
      }).pipe(Effect.provide(layer)),
    workers: (counts: ReadonlyArray<number>) =>
      Effect.gen(function* () {
        return yield* (yield* Bencher).workers(film, {
          workers: counts,
          runs: 2,
          share: false,
          from: Option.some(2),
          to: Option.some(6),
        });
      }).pipe(Effect.provide(layer)),
  };
};

const written = (files: Map<string, Uint8Array>, file: string) =>
  Schema.decodeSync(Schema.fromJsonString(BenchReport))(new TextDecoder().decode(files.get(file)));

describe('Bencher', () => {
  it.live("times every nth frame in one page, and writes each scene's cost", () =>
    Effect.gen(function* () {
      const files = new Map<string, Uint8Array>();
      const { ledger, bench } = setup(files, { drawMs: (i) => 10 + 20 * Number(i >= 240) });
      const report = yield* bench(draw);
      expect(ledger.pages.opened).toBe(1);
      expect(report.scenes.map((s) => [s.id, s.frames, s.sampled, s.medianMs])).toEqual([
        ['a', 240, 8, 10],
        ['b', 360, 12, 30],
      ]);
      // 10 ms × 240 frames + 30 ms × 360 frames.
      expect(report.drawSec).toBeCloseTo(13.2, 9);
      expect(written(files, '/out/test/bench.json').drawSec).toBeCloseTo(13.2, 9);
      expect(files.has('/out/test/bench.baseline.json')).toBe(false);
    }),
  );

  it.live('--baseline keeps the run; within the budget a later run passes', () =>
    Effect.gen(function* () {
      const files = new Map<string, Uint8Array>();
      yield* setup(files).bench({ ...draw, baseline: true });
      expect(written(files, '/out/test/bench.baseline.json').scenes).toHaveLength(2);
      yield* setup(files, { drawMs: () => 10.5 }).bench({ ...draw, budget: true });
    }),
  );

  it.live('--budget fails a scene more than 10% slower than the baseline', () =>
    Effect.gen(function* () {
      const files = new Map<string, Uint8Array>();
      yield* setup(files).bench({ ...draw, baseline: true });
      const slower = setup(files, { drawMs: (i) => 10 + 2 * Number(i >= 240) });
      const error = yield* Effect.flip(slower.bench({ ...draw, budget: true }));
      expect(error._tag).toBe('BenchOverBudget');
      expect(error._tag === 'BenchOverBudget' && error.slower.map((s) => s.what)).toEqual([
        'film',
        'b',
      ]);
      // Without --budget the same run only warns.
      yield* slower.bench(draw);
    }),
  );

  it.live('--budget with no baseline fails', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(setup(new Map()).bench({ ...draw, budget: true }));
      expect(error._tag).toBe('BaselineMissing');
    }),
  );

  it.live('--hash fails the budget on the frames whose pixels moved', () =>
    Effect.gen(function* () {
      const files = new Map<string, Uint8Array>();
      yield* setup(files).bench({ ...draw, hash: true, baseline: true });
      expect(
        Object.keys(written(files, '/out/test/bench.baseline.json').hashes ?? {}),
      ).toHaveLength(20);
      const moved = setup(files, { pixels: (i) => `px${i}${'moved'.repeat(Number(i === 300))}` });
      const error = yield* Effect.flip(moved.bench({ ...draw, hash: true, budget: true }));
      expect(error._tag === 'PixelsMoved' && error.frames).toEqual([300]);
    }),
  );

  it.live('--workers renders the range at each count, runs times, and reports fps', () =>
    Effect.gen(function* () {
      const files = new Map<string, Uint8Array>();
      const { ledger, workers } = setup(files);
      const report = yield* workers([1, 2]);
      expect(report.rows.map((r) => [r.workers, r.frames, r.runsSec.length])).toEqual([
        [1, 120, 2],
        [2, 120, 2],
      ]);
      // Four renders of frames 60–180, each joined once.
      expect(ledger.joins.map((j) => j.frames)).toEqual([120, 120, 120, 120]);
      expect(files.has('/out/test/bench.workers.json')).toBe(true);
    }),
  );

  it.live('--workers with a count past the encoders fails before any render', () =>
    Effect.gen(function* () {
      const files = new Map<string, Uint8Array>();
      const { ledger, workers } = setup(files);
      const error = yield* Effect.flip(workers([2, 15]));
      expect(error._tag).toBe('TooManyEncoders');
      expect(ledger.joins).toEqual([]);
      expect(ledger.pages.opened).toBe(0);
    }),
  );
});
