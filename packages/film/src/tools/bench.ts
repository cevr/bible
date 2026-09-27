// What `film bench` measures and how it judges a run, decided without a
// browser: the frames it samples and the scene each belongs to, the per-scene
// summary of their times, the report as it is written to disk, and the budget
// a later run on the same machine must keep. `Bencher` only runs it.

import { Array as Arr, Option, Order, Record as Rec, Schema } from 'effect';
import type { Placed } from '../core/layout.ts';
import type { FlagRule } from './render-plan.ts';

/** A sampled frame and the scene playing at it. */
export interface BenchFrame {
  readonly frame: number;
  readonly scene: string;
}

/** The scene playing at film time `T`: the last to start at or before it. */
const sceneAt = (placed: ReadonlyArray<Placed>, T: number): string =>
  Option.getOrElse(
    Option.map(
      Option.orElse(
        Arr.findLast(placed, (p) => T >= p.start),
        () => Arr.head(placed),
      ),
      (p) => p.spec.id,
    ),
    () => '',
  );

/** Every frame of the film, tagged by its scene. */
export const filmFrames = (
  placed: ReadonlyArray<Placed>,
  fps: number,
  frames: number,
): ReadonlyArray<BenchFrame> =>
  Arr.makeBy(frames, (frame) => ({ frame, scene: sceneAt(placed, frame / fps) }));

/** Every `every`th frame of the film, in `scenes` when given. */
export const benchFrames = (
  all: ReadonlyArray<BenchFrame>,
  every: number,
  scenes: Option.Option<ReadonlySet<string>>,
): ReadonlyArray<BenchFrame> =>
  all.filter(
    (f) =>
      f.frame % Math.max(1, every) === 0 &&
      Option.match(scenes, { onNone: () => true, onSome: (ids) => ids.has(f.scene) }),
  );

/** Frames hashed for the pixel guard: every this many frames, whatever `--every` is. */
export const HASH_EVERY = 30;

/** The frames `--hash` hashes: every `HASH_EVERY`th frame, in `scenes` when given. */
export const hashFrames = (
  all: ReadonlyArray<BenchFrame>,
  scenes: Option.Option<ReadonlySet<string>>,
): ReadonlyArray<number> => benchFrames(all, HASH_EVERY, scenes).map((f) => f.frame);

const sorted = (xs: ReadonlyArray<number>) => Arr.sort(xs, Order.Number);

/** The middle value (the mean of the middle two), or 0 for none. */
export const median = (xs: ReadonlyArray<number>): number => {
  const s = sorted(xs);
  const mid = Math.floor(s.length / 2);
  if (s.length === 0) return 0;
  if (s.length % 2 === 1) return s[mid] ?? 0;
  return ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
};

/** The nearest-rank 95th percentile, or 0 for none. */
const p95 = (xs: ReadonlyArray<number>): number => {
  const s = sorted(xs);
  return s[Math.max(0, Math.ceil(s.length * 0.95) - 1)] ?? 0;
};

/** The mean, or 0 for none. */
const mean = (xs: ReadonlyArray<number>) =>
  xs.reduce((sum, x) => sum + x, 0) / Math.max(1, xs.length);

/** Each sampled frame's median over the runs: `runs[r][k]` is run r's time for frame k. */
export const medianPerFrame = (runs: ReadonlyArray<ReadonlyArray<number>>): ReadonlyArray<number> =>
  Arr.makeBy(
    Arr.head(runs).pipe(
      Option.map((r) => r.length),
      Option.getOrElse(() => 0),
    ),
    (k) => median(runs.map((run) => run[k] ?? 0)),
  );

/** One scene's draw cost. */
export const BenchScene = Schema.Struct({
  id: Schema.String,
  /** The scene's frames in the film. */
  frames: Schema.Int,
  /** Of those, the ones timed. */
  sampled: Schema.Int,
  medianMs: Schema.Finite,
  p95Ms: Schema.Finite,
  meanMs: Schema.Finite,
  /** Seconds the whole scene takes to draw: its mean times its frames. */
  costSec: Schema.Finite,
});
export type BenchScene = typeof BenchScene.Type;

/** The machine a run was measured on: numbers compare only on the same one. */
export const Machine = Schema.Struct({ cpu: Schema.String, cores: Schema.Int });
export type Machine = typeof Machine.Type;

/** `out/<film>/bench.json`: ms of draw per frame, per scene, and the pixel hashes. */
export const BenchReport = Schema.Struct({
  film: Schema.String,
  machine: Machine,
  /** ISO time of the run. */
  at: Schema.String,
  every: Schema.Int,
  runs: Schema.Int,
  /** Frames timed. */
  sampled: Schema.Int,
  /** Seconds the scenes timed take to draw, summed over all their frames. */
  drawSec: Schema.Finite,
  medianMs: Schema.Finite,
  scenes: Schema.Array(BenchScene),
  /** With `--hash`: the pixels of every `HASH_EVERY`th frame, by frame. */
  hashes: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
export type BenchReport = typeof BenchReport.Type;

/** A frame timed: its scene and its median ms. */
export interface TimedFrame {
  readonly frame: number;
  readonly scene: string;
  readonly ms: number;
}

/**
 * Per scene, in film order: the median, p95 and mean of its sampled frames,
 * and its cost over every frame it has (`all`).
 */
export const summarize = (
  timed: ReadonlyArray<TimedFrame>,
  all: ReadonlyArray<BenchFrame>,
): ReadonlyArray<BenchScene> => {
  const ids = Arr.dedupe(timed.map((t) => t.scene));
  return ids.map((id) => {
    const ms = timed.filter((t) => t.scene === id).map((t) => t.ms);
    const frames = all.filter((f) => f.scene === id).length;
    const meanMs = mean(ms);
    return {
      id,
      frames,
      sampled: ms.length,
      medianMs: median(ms),
      p95Ms: p95(ms),
      meanMs,
      costSec: (meanMs * frames) / 1000,
    };
  });
};

/** How far over the baseline a run may be before the budget fails it. */
export const BUDGET_TOLERANCE = 0.1;
/** A scene drawing faster than this is noise, not a cost: it never fails the budget. */
export const BUDGET_FLOOR_MS = 2;

/** A measure over its budget: `now` against `before`. */
export interface Slower {
  /** A scene id, or `film` for the summed draw time. */
  readonly what: string;
  readonly now: number;
  readonly before: number;
}

/** A run held against its baseline. */
export type BudgetVerdict =
  | { readonly _tag: 'OtherMachine'; readonly baseline: Machine }
  | {
      readonly _tag: 'Compared';
      readonly slower: ReadonlyArray<Slower>;
      /** Frames whose pixels differ from the baseline's (both hashed). */
      readonly moved: ReadonlyArray<number>;
    };

/** `what`, when `now` is more than the budget over `before`. */
const slower = (what: string, now: number, before: number): ReadonlyArray<Slower> =>
  Arr.filter([{ what, now, before }], (s) => s.now > s.before * (1 + BUDGET_TOLERANCE));

/** Frames hashed in both runs whose hashes differ. */
const movedFrames = (now: BenchReport, baseline: BenchReport): ReadonlyArray<number> =>
  Option.match(
    Option.all([Option.fromNullishOr(now.hashes), Option.fromNullishOr(baseline.hashes)]),
    {
      onNone: () => [],
      onSome: ([a, b]) =>
        Object.entries(a)
          .filter(([frame, hash]) => Option.exists(Rec.get(b, frame), (was) => was !== hash))
          .map(([frame]) => Number(frame)),
    },
  );

const sameMachine = (a: Machine, b: Machine) => a.cpu === b.cpu && a.cores === b.cores;

/**
 * `now` against `baseline`: the film's draw seconds and each scene's median
 * more than `BUDGET_TOLERANCE` slower, and the frames whose pixels moved. Only
 * on the machine the baseline was measured on; a scene the baseline drew under
 * `BUDGET_FLOOR_MS` never counts, and the film's sum counts only when the run
 * timed the baseline's scenes.
 */
export const judge = (now: BenchReport, baseline: BenchReport): BudgetVerdict => {
  if (!sameMachine(now.machine, baseline.machine))
    return { _tag: 'OtherMachine', baseline: baseline.machine };
  const before = new Map(baseline.scenes.map((s) => [s.id, s]));
  const scenes = now.scenes.flatMap((s) =>
    Option.match(
      Option.filter(
        Option.fromNullishOr(before.get(s.id)),
        (was) => was.medianMs >= BUDGET_FLOOR_MS,
      ),
      { onNone: () => [], onSome: (was) => slower(s.id, s.medianMs, was.medianMs) },
    ),
  );
  const same = now.scenes.length === before.size && now.scenes.every((s) => before.has(s.id));
  const film = Arr.filter(slower('film', now.drawSec, baseline.drawSec), () => same);
  return { _tag: 'Compared', slower: [...film, ...scenes], moved: movedFrames(now, baseline) };
};

const DRAW = 'the draw leg times frames; --workers times renders';
const RANGE = 'only --workers renders a range';

/** `film bench` flags that one leg or the other would ignore. */
export const BENCH_RULES: ReadonlyArray<FlagRule> = [
  ['every', 'excludes', 'workers', DRAW],
  ['hash', 'excludes', 'workers', DRAW],
  ['baseline', 'excludes', 'workers', DRAW],
  ['budget', 'excludes', 'workers', DRAW],
  ['baseline', 'excludes', 'budget', '--baseline keeps this run; --budget holds a run against it'],
  ['from', 'needs', 'workers', RANGE],
  ['to', 'needs', 'workers', RANGE],
  ['share', 'needs', 'workers', 'only --workers encodes'],
  ['scene', 'excludes', 'from', '--scene sets the range from the layout'],
  ['scene', 'excludes', 'to', '--scene sets the range from the layout'],
];

/** A worker count timed rendering the same range: its runs and its median. */
export const WorkersRow = Schema.Struct({
  workers: Schema.Int,
  share: Schema.Boolean,
  frames: Schema.Int,
  runsSec: Schema.Array(Schema.Finite),
  medianSec: Schema.Finite,
  fps: Schema.Finite,
});
export type WorkersRow = typeof WorkersRow.Type;

/** `out/<film>/bench.workers.json`: the same range rendered at each worker count. */
export const WorkersReport = Schema.Struct({
  film: Schema.String,
  machine: Machine,
  at: Schema.String,
  from: Schema.Finite,
  to: Schema.Finite,
  rows: Schema.Array(WorkersRow),
});
export type WorkersReport = typeof WorkersReport.Type;

/** A worker count's runs, summarized; a run under a millisecond counts as one. */
export const workersRow = (
  workers: number,
  share: boolean,
  frames: number,
  runsSec: ReadonlyArray<number>,
): WorkersRow => {
  const medianSec = median(runsSec);
  return { workers, share, frames, runsSec, medianSec, fps: frames / Math.max(medianSec, 1e-3) };
};
