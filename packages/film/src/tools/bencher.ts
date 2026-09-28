// `film bench`: how fast a film draws and renders, measured on the render
// path itself. The draw leg times each sampled frame in one headless export
// page (the renderer's page, flags and canvas), summarizes per scene, and
// holds the run against a baseline measured on the same machine. The workers
// leg renders one range at each worker count and reports the median fps. The
// plan, the summary and the budget are pure (`bench.ts`).

import { cpus } from 'node:os';
import {
  Array as Arr,
  Clock,
  Console,
  Context,
  DateTime,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import {
  BenchReport,
  type Machine,
  WorkersReport,
  benchFrames,
  filmFrames,
  hashFrames,
  judge,
  median,
  medianPerFrame,
  summarize,
  workersRow,
} from './bench.ts';
import { Browser, type FramePage, type PageOpenError } from './browser.ts';
import {
  BaselineIncomparable,
  BaselineMissing,
  BaselineUnhashed,
  BenchOverBudget,
  FileInvalid,
  type FrameFailed,
  type PageCrashed,
  type PageError,
  PixelsMoved,
} from './errors.ts';
import { type LoadedFilm, type PlaceError, placeFilm } from './film-repo.ts';
import { PreviewServer } from './preview-server.ts';
import { encoderName } from '../core/encoder.ts';
import { shortPage } from '../core/shorts.ts';
import { Cut, RenderJob, cutPage, frameSpan, videoEncoders } from './render-plan.ts';
import { Cores, type RenderError, Renderer } from './renderer.ts';

export interface DrawBenchOptions {
  /** Time every this many frames. */
  readonly every: number;
  /** Draw the captions, as `render` burns them in by default. */
  readonly captions: boolean;
  /** Times each frame is timed; the median counts. */
  readonly runs: number;
  /** Only these scenes. */
  readonly scenes: Option.Option<ReadonlySet<string>>;
  /** Also hash every `HASH_EVERY`th frame's pixels. */
  readonly hash: boolean;
  /** Keep this run as the baseline later runs are held against. */
  readonly baseline: boolean;
  /** Fail when the run is over its baseline's budget, or its pixels moved. */
  readonly budget: boolean;
}

export interface WorkersBenchOptions {
  /** The worker counts to render at. */
  readonly workers: ReadonlyArray<number>;
  readonly runs: number;
  readonly share: boolean;
  /** Burn the captions in, as `render` does by default. */
  readonly captions: boolean;
  /** The range rendered, in seconds. */
  readonly from: Option.Option<number>;
  readonly to: Option.Option<number>;
  /** The film, or one of its shorts (`--short`), on the pages a render draws it on. */
  readonly cut: Cut;
}

export type BenchError =
  | PageOpenError
  | PageError
  | PageCrashed
  | FrameFailed
  | PlaceError
  | FileInvalid
  | BaselineIncomparable
  | BaselineMissing
  | BaselineUnhashed
  | BenchOverBudget
  | PixelsMoved
  | PlatformError;

export interface BencherService {
  /** Time the film's sampled frames and write `out/<film>/bench.json`. */
  readonly draw: (
    film: LoadedFilm,
    options: DrawBenchOptions,
  ) => Effect.Effect<BenchReport, BenchError>;
  /** Render one range at each worker count and write `out/<film>/bench.workers.json`. */
  readonly workers: (
    film: LoadedFilm,
    options: WorkersBenchOptions,
  ) => Effect.Effect<WorkersReport, RenderError | FileInvalid>;
}

/** Frames per page call: a batch at the slowest scene stays well inside the call's timeout. */
const BATCH = 60;

/** Warm-up draws every this many sampled frames once before the clock starts. */
const WARM_EVERY = 3;

const machine = Effect.sync((): Machine => {
  const all = cpus();
  return {
    cpu: Arr.head(all).pipe(
      Option.map((c) => c.model),
      Option.getOrElse(() => ''),
    ),
    cores: all.length,
  };
});

const BenchJson = Schema.fromJsonString(BenchReport);
const WorkersJson = Schema.fromJsonString(WorkersReport);

const pad = (s: string, n: number) => s.padEnd(n);
const num = (x: number, n: number, digits = 1) => x.toFixed(digits).padStart(n);

export class Bencher extends Context.Service<Bencher, BencherService>()(
  '@bible/film/tools/Bencher',
) {
  static readonly layer = Layer.effect(
    Bencher,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const browser = yield* Browser;
      const server = yield* PreviewServer;
      const renderer = yield* Renderer;

      /** The export page `render` opens, with the same captions choice. */
      const url = (film: LoadedFilm, captions: boolean, cut: Cut = Cut.Whole()) =>
        [
          `${server.url}?film=${encodeURIComponent(cutPage(film.paths.name, cut))}`,
          'export',
          ...Arr.filter(['captions=0'], () => !captions),
        ].join('&');

      /** `frames` through `call` on `page`, a batch at a time. */
      const batched = <A, E>(
        frames: ReadonlyArray<number>,
        call: (batch: ReadonlyArray<number>) => Effect.Effect<ReadonlyArray<A>, E>,
      ) =>
        Effect.map(Effect.forEach(Arr.chunksOf(frames, BATCH), call), (parts): ReadonlyArray<A> =>
          parts.flat(),
        );

      const writeJson = <A>(file: string, codec: Schema.Codec<A, string>, value: A) =>
        Schema.encodeEffect(codec)(value).pipe(
          Effect.mapError((error) => FileInvalid.make({ file, reason: error.message })),
          Effect.flatMap((text) => fs.writeFileString(file, `${text}\n`)),
        );

      const readBaseline = (file: string) =>
        fs
          .readFileString(file)
          .pipe(
            Effect.flatMap((text) =>
              Schema.decodeEffect(BenchJson)(text).pipe(
                Effect.mapError((error) => FileInvalid.make({ file, reason: error.message })),
              ),
            ),
          );

      /** Time `frames` `runs` times after one warm-up pass; each frame's median. */
      const timeRuns = (page: FramePage, frames: ReadonlyArray<number>, runs: number) =>
        Effect.gen(function* () {
          yield* batched(
            frames.filter((_, k) => k % WARM_EVERY === 0),
            page.time,
          );
          const all = yield* Effect.forEach(Arr.range(1, Math.max(1, runs)), () =>
            batched(frames, page.time),
          );
          return medianPerFrame(all);
        });

      const printDraw = (report: BenchReport) =>
        Effect.gen(function* () {
          yield* Console.log(
            `${pad('scene', 10)} ${'frames'.padStart(6)} ${'median'.padStart(7)} ${'p95'.padStart(7)} ${'mean'.padStart(7)} ${'cost s'.padStart(7)}`,
          );
          for (const s of report.scenes)
            yield* Console.log(
              `${pad(s.id, 10)} ${String(s.frames).padStart(6)} ${num(s.medianMs, 7)} ${num(s.p95Ms, 7)} ${num(s.meanMs, 7)} ${num(s.costSec, 7)}`,
            );
          yield* Console.log(
            `${pad('film', 10)} ${String(report.sampled).padStart(6)} ${num(report.medianMs, 7)} ${''.padStart(7)} ${''.padStart(7)} ${num(report.drawSec, 7)}`,
          );
        });

      /** Hold `report` against the baseline on disk, if there is one; with `budget`, fail on what it finds. */
      const holdToBaseline = (report: BenchReport, file: string, budget: boolean) =>
        Effect.gen(function* () {
          if (!(yield* fs.exists(file))) {
            if (budget) return yield* BaselineMissing.make({ file });
            return;
          }
          const verdict = judge(report, yield* readBaseline(file));
          if (verdict._tag === 'Incomparable') {
            if (budget) return yield* BaselineIncomparable.make({ file, reason: verdict.reason });
            yield* Effect.logWarning(`bench.baseline not-compared reason="${verdict.reason}"`);
            return;
          }
          // A hashed run whose baseline kept no hashes would pass its pixels unchecked.
          if (verdict.unhashed) return yield* BaselineUnhashed.make({ file });
          if (Option.isNone(Option.fromNullishOr(report.hashes)))
            yield* Effect.logWarning(
              'bench.baseline pixels-not-compared reason="run without --hash"',
            );
          for (const s of verdict.slower)
            yield* Effect.logWarning(
              `bench.slower what=${s.what} now=${s.now.toFixed(2)} before=${s.before.toFixed(2)}`,
            );
          if (verdict.moved.length > 0)
            yield* Effect.logWarning(`bench.moved frames=${verdict.moved.join(',')}`);
          yield* Effect.log(
            `bench.baseline slower=${verdict.slower.length} moved=${verdict.moved.length} budget=${budget}`,
          );
          if (!budget) return;
          if (verdict.slower.length > 0)
            return yield* BenchOverBudget.make({ slower: verdict.slower });
          if (verdict.moved.length > 0) return yield* PixelsMoved.make({ frames: verdict.moved });
        });

      const draw = Effect.fn('Bencher.draw')(function* (
        film: LoadedFilm,
        options: DrawBenchOptions,
      ) {
        const placed = yield* placeFilm(film);
        const measured = yield* Effect.scoped(
          Effect.gen(function* () {
            const page = yield* browser.open(url(film, options.captions));
            const all = filmFrames(placed, page.info.fps, page.info.frames);
            const sampled = benchFrames(all, options.every, options.scenes);
            const ms = yield* timeRuns(
              page,
              sampled.map((f) => f.frame),
              options.runs,
            );
            const timed = Arr.zipWith(sampled, ms, (f, t) => ({ ...f, ms: t }));
            const hashed = hashFrames(all, options.scenes);
            const hashes = yield* Effect.when(
              Effect.map(batched(hashed, page.hash), (found) =>
                Object.fromEntries(Arr.zip(hashed.map(String), found)),
              ),
              Effect.succeed(options.hash),
            );
            return {
              scenes: summarize(timed, all),
              medianMs: median(timed.map((t) => t.ms)),
              sampled: timed.length,
              hashes,
            };
          }),
        );
        const drawn: BenchReport = {
          film: film.paths.name,
          machine: yield* machine,
          at: DateTime.formatIso(yield* DateTime.now),
          every: options.every,
          runs: options.runs,
          sampled: measured.sampled,
          drawSec: measured.scenes.reduce((sum, s) => sum + s.costSec, 0),
          medianMs: measured.medianMs,
          captions: options.captions,
          scenes: measured.scenes,
        };
        const report = Option.match(measured.hashes, {
          onNone: () => drawn,
          onSome: (hashes): BenchReport => ({ ...drawn, hashes }),
        });
        yield* fs.makeDirectory(film.paths.out, { recursive: true });
        const file = path.join(film.paths.out, 'bench.json');
        const baseline = path.join(film.paths.out, 'bench.baseline.json');
        yield* writeJson(file, BenchJson, report);
        yield* printDraw(report);
        yield* Effect.log(
          `bench.done film=${report.film} sampled=${report.sampled} every=${report.every} runs=${report.runs} median=${report.medianMs.toFixed(1)}ms draw=${report.drawSec.toFixed(1)}s hashes=${Option.match(measured.hashes, { onNone: () => 0, onSome: (h) => Object.keys(h).length })} file=${file}`,
        );
        if (options.baseline) {
          yield* writeJson(baseline, BenchJson, report);
          yield* Effect.log(`bench.baseline written file=${baseline}`);
          return report;
        }
        yield* holdToBaseline(report, baseline, options.budget);
        return report;
      });

      const workers = Effect.fn('Bencher.workers')(function* (
        film: LoadedFilm,
        options: WorkersBenchOptions,
      ) {
        // One page says what the range is and which encoder the renders will use.
        const { info, encoder } = yield* Effect.scoped(
          Effect.gen(function* () {
            const page = yield* browser.open(url(film, options.captions, options.cut));
            // A short's page encodes down to 1080 × 1920, as the render does.
            const scale = Cut.$match(options.cut, {
              Whole: () => 1,
              Short: () => shortPage(page.info.width).scale,
            });
            return { info: page.info, encoder: yield* page.encoder(scale) };
          }),
        );
        // Before any render: every count must fit the encoders, not just the first.
        const cores = yield* Cores;
        yield* Effect.forEach(options.workers, (n) =>
          Effect.fromResult(videoEncoders(n, options.share, encoder, cores)),
        );
        yield* Effect.log(`bench.encoder kind=${encoderName(encoder)} cores=${cores}`);
        const { start, end } = frameSpan(info, options.from, options.to);
        const from = start / info.fps;
        const to = end / info.fps;
        const rows = yield* Effect.scoped(
          Effect.gen(function* () {
            const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'film-bench-' });
            return yield* Effect.forEach(options.workers, (n) =>
              Effect.gen(function* () {
                const job = RenderJob.Video({
                  tag: 'bench',
                  captions: options.captions,
                  workers: Option.some(n),
                  from: Option.some(from),
                  to: Option.some(to),
                  scale: 1,
                  out: Option.some(path.join(dir, `w${n}.mp4`)),
                  share: options.share,
                  cut: options.cut,
                });
                const runsSec = yield* Effect.forEach(Arr.range(1, Math.max(1, options.runs)), () =>
                  Effect.gen(function* () {
                    const began = yield* Clock.currentTimeMillis;
                    yield* renderer.render(film, job);
                    return ((yield* Clock.currentTimeMillis) - began) / 1000;
                  }),
                );
                const row = workersRow(n, options.share, end - start, runsSec);
                yield* Effect.log(
                  `bench.workers workers=${n} share=${options.share} frames=${row.frames} median=${row.medianSec.toFixed(1)}s fps=${row.fps.toFixed(1)} runs=${runsSec.map((s) => s.toFixed(1)).join(',')}`,
                );
                return row;
              }),
            );
          }),
        );
        const report: WorkersReport = {
          film: film.paths.name,
          machine: yield* machine,
          at: DateTime.formatIso(yield* DateTime.now),
          from,
          to,
          rows,
        };
        yield* fs.makeDirectory(film.paths.out, { recursive: true });
        const file = path.join(film.paths.out, 'bench.workers.json');
        yield* writeJson(file, WorkersJson, report);
        yield* Effect.log(`bench.done film=${report.film} rows=${rows.length} file=${file}`);
        return report;
      });

      return Bencher.of({ draw, workers });
    }),
  );
}
