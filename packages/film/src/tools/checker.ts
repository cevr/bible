// The layout leg of `film check`: the player draws each sampled frame with the
// text probe on, in a pool of headless pages, and the pure detectors in
// `check.ts` read the boxes it reports. Then it probes across each stretch the
// static leg names as a hold candidate, to tell a still picture from motion
// no cue declares. The server, the browser and the pages live in one scope, as
// in a render.

import { Array as Arr, Context, Effect, Layer, Option, Pool } from 'effect';
import type { Probed } from '../core/schema.ts';
import { Browser, type FramePage, type PageOpenError } from './browser.ts';
import {
  HOLD,
  type HoldCandidate,
  type LayoutFinding,
  type Sample,
  frameFindings,
  heldStill,
  holdCandidates,
  holdGrid,
  holdTicks,
  stillSpan,
  platesOffFrame,
  layoutSamples,
  mergeFindings,
} from './check.ts';
import { type FrameFailed, type PageCrashed, type PageError, StaticHold } from './errors.ts';
import { type LoadedFilm, type PlaceError, placeFilm } from './film-repo.ts';
import { PreviewServer } from './preview-server.ts';

export type LayoutCheckError = PageOpenError | PageError | PageCrashed | FrameFailed | PlaceError;

export interface LayoutCheckOptions {
  /** Pages probing at once. */
  readonly workers: number;
  /** Only these scenes. */
  readonly scenes: Option.Option<ReadonlySet<string>>;
}

/** Whether the check probes `scene`: every scene, or only those `--scene` names. */
const chosen = (options: LayoutCheckOptions, scene: string) =>
  Option.match(options.scenes, {
    onNone: () => true,
    onSome: (ids) => ids.has(scene),
  });

type ProbeFrame = (
  i: number,
) => Effect.Effect<Probed, PageOpenError | PageError | PageCrashed | FrameFailed>;

/** Probe frames on `pool`, each at most once however many runs reach it: `seen` keeps them. */
const probedOnce =
  (pool: Pool.Pool<FramePage, PageOpenError>, seen: Map<number, Probed>): ProbeFrame =>
  (i) =>
    Option.match(Option.fromNullishOr(seen.get(i)), {
      onSome: (probed) => Effect.succeed(probed),
      onNone: () =>
        Effect.scoped(Effect.flatMap(Pool.get(pool), (page) => page.probe(i))).pipe(
          Effect.tap((probed) => Effect.sync(() => void seen.set(i, probed))),
        ),
    });

/** What probing across one hold candidate found, and how many frames it drew. */
interface HoldProbe {
  readonly holds: ReadonlyArray<StaticHold>;
  readonly frames: number;
}

/**
 * The last of `frames`, in order, that holds still against `anchor` before
 * one moves; `from` when the first moves. They are probed `workers` at a
 * time, so a run grows on every page at once.
 */
const reach = (
  probeAt: ProbeFrame,
  workers: number,
  anchor: Probed,
  from: number,
  frames: ReadonlyArray<number>,
) =>
  Effect.gen(function* () {
    let still = from;
    for (const batch of Arr.chunksOf(frames, workers)) {
      const probed = yield* Effect.forEach(batch, probeAt, { concurrency: workers });
      for (const [i, p] of Arr.zip(batch, probed)) {
        if (!heldStill([anchor, p])) return still;
        still = i;
      }
    }
    return still;
  });

/**
 * A hold candidate is a `StaticHold` when a run of its boil ticks over
 * `HOLD` holds still against one of them: the longest such run is reported.
 * The grid ticks are probed first; where two in a row hold still, the run
 * grows from the first of them tick by tick each way until a tick moves, so
 * motion no cue declares ends a run and the still stretch after it is still
 * found. Most candidates that move show it at their grid.
 */
const confirmHold = (
  pool: Pool.Pool<FramePage, PageOpenError>,
  workers: number,
  fps: number,
  hold: HoldCandidate,
): Effect.Effect<HoldProbe, PageOpenError | PageError | PageCrashed | FrameFailed> =>
  Effect.gen(function* () {
    const seen = new Map<number, Probed>();
    const probeAt = probedOnce(pool, seen);
    const ticks = holdTicks(hold, fps);
    const grid = holdGrid(ticks);
    // The grid first, as many at once as there are pages.
    yield* Effect.forEach(grid, probeAt, { concurrency: workers, discard: true });
    let longest: readonly [number, number] = [hold.from, hold.from];
    let reached = -1;
    for (const [tick, next] of Arr.zip(grid, grid.slice(1))) {
      // A grid tick inside the run found last would only find it again.
      if (tick <= reached) continue;
      const anchor = yield* probeAt(tick);
      if (!heldStill([anchor, yield* probeAt(next)])) continue;
      const at = ticks.indexOf(tick);
      const hi = yield* reach(probeAt, workers, anchor, tick, ticks.slice(at + 1));
      const lo = yield* reach(probeAt, workers, anchor, tick, ticks.slice(0, at).reverse());
      const run = stillSpan(hold, ticks, lo, hi, fps);
      reached = hi;
      if (run[1] - run[0] > longest[1] - longest[0]) longest = run;
    }
    const [from, to] = longest;
    if (to - from <= HOLD + 1e-9) return { holds: [], frames: seen.size };
    return {
      holds: [StaticHold.make({ scene: hold.scene, from, to, max: HOLD })],
      frames: seen.size,
    };
  });

export interface CheckerService {
  /**
   * Probe every sampled frame and return what collides, one finding per pair
   * and scene; then probe across each hold candidate and return the ones that
   * hold still.
   */
  readonly layout: (
    film: LoadedFilm,
    options: LayoutCheckOptions,
  ) => Effect.Effect<ReadonlyArray<LayoutFinding>, LayoutCheckError>;
}

export class Checker extends Context.Service<Checker, CheckerService>()(
  '@bible/film/tools/Checker',
) {
  static readonly layer = Layer.effect(
    Checker,
    Effect.gen(function* () {
      const browser = yield* Browser;
      const server = yield* PreviewServer;

      const layout = Effect.fn('Checker.layout')(function* (
        film: LoadedFilm,
        options: LayoutCheckOptions,
      ) {
        const placed = yield* placeFilm(film);
        const url = `${server.url}?film=${encodeURIComponent(film.paths.name)}&export`;
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const workers = Math.max(1, options.workers);
            const pool = yield* Pool.make({ acquire: browser.open(url), size: workers });
            const info = yield* Effect.scoped(Effect.map(Pool.get(pool), (page) => page.info));
            const samples = layoutSamples(placed, info.fps).filter((s) => chosen(options, s.scene));
            const probe = (sample: Sample) =>
              Effect.scoped(
                Effect.gen(function* () {
                  const page = yield* Pool.get(pool);
                  const probed = yield* page.probe(sample.frame);
                  // A plate past an edge may be moving: only then is the next frame worth drawing.
                  if (platesOffFrame(sample, probed, info).length === 0)
                    return frameFindings(sample, probed, info);
                  const next = yield* page.probe(Math.min(sample.frame + 1, info.frames - 1));
                  return frameFindings(sample, probed, info, next);
                }),
              );
            const found = yield* Effect.forEach(samples, probe, { concurrency: workers });
            const findings = mergeFindings(found.flat());
            yield* Effect.log(
              `check.layout film=${film.paths.name} frames=${samples.length} findings=${findings.length}`,
            );
            const candidates = holdCandidates(placed).filter((c) => chosen(options, c.scene));
            const probed = yield* Effect.forEach(
              candidates,
              (hold) => confirmHold(pool, workers, info.fps, hold),
              { concurrency: workers },
            );
            const holds = probed.flatMap((p) => p.holds);
            const frames = probed.reduce((n, p) => n + p.frames, 0);
            yield* Effect.log(
              `check.hold film=${film.paths.name} candidates=${candidates.length} frames=${frames} holds=${holds.length}`,
            );
            return [...findings, ...holds];
          }),
        );
      });

      return Checker.of({ layout });
    }),
  );
}
