// The layout leg of `film check`: the player draws each sampled frame with the
// text probe on, in a pool of headless pages, and the pure detectors in
// `check.ts` read the boxes it reports. Then it probes across each stretch the
// static leg names as a hold candidate, to tell a still picture from motion
// no cue declares. The pages are a pool of `Pages`, in the check's scope, as
// in a render.

import { Array as Arr, Context, Effect, Layer, Option } from 'effect';
import type { Scope } from '../core/address.ts';
import type { Interval } from '../core/time.ts';
import { shortPhrases } from '../core/phrases.ts';
import type { ShortError } from '../core/errors.ts';
import type { LumaArea, Probed } from '../core/export-handle.ts';
import type { Short } from '../core/schema.ts';
import {
  type ResolvedShort,
  bandOf,
  SHORT_RULES,
  SHORT_WIDTH,
  type SafeZoneName,
  resolveShort,
  shortKey,
} from '../core/shorts.ts';
import { type PageOpenError, lumaOf } from './browser.ts';
import {
  loopPicture,
  lumaDiff,
  mergeUnsafe,
  openFrames,
  shortStaticFindings,
  stillOpen,
  titleOpen,
  unsafeTexts,
  zoneFrames,
} from './short-check.ts';
import {
  HOLD,
  type HoldCandidate,
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
import type { FrameFailed, PageCrashed, PageError } from './errors.ts';
import { type LayoutFinding, type ShortFinding, StaticHold } from './findings.ts';
import { type LoadedFilm, type PlaceError, placeFilm } from './film-repo.ts';
import { type ExportPages, Pages } from './pages.ts';

export type LayoutCheckError = PageOpenError | PageError | PageCrashed | FrameFailed | PlaceError;

export interface LayoutCheckOptions {
  /** Pages probing at once. */
  readonly workers: number;
  /** The part of the film probed (`resolveAddress`): every scene for the whole film. */
  readonly scope: Scope;
}

type ProbeFrame = (
  i: number,
) => Effect.Effect<Probed, PageOpenError | PageError | PageCrashed | FrameFailed>;

/** Probe frames on `pages`, each at most once however many runs reach it: `seen` keeps them. */
const probedOnce =
  (pages: ExportPages, seen: Map<number, Probed>): ProbeFrame =>
  (i) =>
    Option.match(Option.fromNullishOr(seen.get(i)), {
      onSome: (probed) => Effect.succeed(probed),
      onNone: () =>
        pages
          .call('probe', i)
          .pipe(Effect.tap((probed) => Effect.sync(() => void seen.set(i, probed)))),
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
  pages: ExportPages,
  workers: number,
  fps: number,
  hold: HoldCandidate,
): Effect.Effect<HoldProbe, PageOpenError | PageError | PageCrashed | FrameFailed> =>
  Effect.gen(function* () {
    const seen = new Map<number, Probed>();
    const probeAt = probedOnce(pages, seen);
    const ticks = holdTicks(hold, fps);
    const grid = holdGrid(ticks);
    // The grid first, as many at once as there are pages.
    yield* Effect.forEach(grid, probeAt, { concurrency: workers, discard: true });
    let longest: Interval = { from: hold.from, to: hold.from };
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
      if (run.to - run.from > longest.to - longest.from) longest = run;
    }
    const { from, to } = longest;
    if (to - from <= HOLD + 1e-9) return { holds: [], frames: seen.size };
    return {
      holds: [StaticHold.make({ scene: hold.scene, from, to, max: HOLD })],
      frames: seen.size,
    };
  });

export interface ShortCheckOptions {
  /** Pages probing at once. */
  readonly workers: number;
  /** The safe zone its text is held to. */
  readonly zone: SafeZoneName;
  /** Only what its words tell: no frame is probed (the page is opened for its frame rate alone). */
  readonly static: boolean;
}

export type ShortCheckError = LayoutCheckError | ShortError;

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
  /** A short on its page's frames (`shortKey`): the rate the film declares, as the renderer reads it. */
  readonly cut: (film: LoadedFilm, short: Short) => Effect.Effect<ResolvedShort, ShortCheckError>;
  /**
   * Check a short, resolved on its page's frames: what its words tell (its
   * length, its first word, its loop's silence); then, unless `static`, its
   * page probed every half second and at each phrase's first frame for text
   * past the safe zone, the open for motion and the film's title card, and
   * its first and last frames' band for the loop.
   */
  readonly short: (
    film: LoadedFilm,
    short: Short,
    options: ShortCheckOptions,
  ) => Effect.Effect<ReadonlyArray<ShortFinding>, ShortCheckError>;
}

export class Checker extends Context.Service<Checker, CheckerService>()(
  '@bible/film/tools/Checker',
) {
  /** On pages of its own (`Pages`), in the `Browser`, on the app's `PreviewServer`. */
  static readonly layer = Layer.effect(
    Checker,
    Effect.gen(function* () {
      const pages = yield* Pages;

      const layout = Effect.fn('Checker.layout')(function* (
        film: LoadedFilm,
        options: LayoutCheckOptions,
      ) {
        const placed = yield* placeFilm(film);
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const workers = Math.max(1, options.workers);
            const pool = yield* pages.open(film.paths.name, { workers, captions: true });
            const info = pool.info;
            const chosen = new Set(options.scope.scenes.map((p) => p.spec.id));
            const samples = layoutSamples(placed, info.fps).filter((s) => chosen.has(s.scene));
            const probe = (sample: Sample) =>
              pool.use((page) =>
                Effect.gen(function* () {
                  const probed = yield* page.call('probe', sample.frame);
                  // A plate past an edge may be moving: only then is the next frame worth drawing.
                  if (platesOffFrame(sample, probed, info).length === 0)
                    return frameFindings(sample, probed, info);
                  const next = yield* page.call(
                    'probe',
                    Math.min(sample.frame + 1, info.frames - 1),
                  );
                  return frameFindings(sample, probed, info, next);
                }),
              );
            const found = yield* Effect.forEach(samples, probe, { concurrency: workers });
            const findings = mergeFindings(found.flat());
            yield* Effect.log(
              `check.layout film=${film.paths.name} frames=${samples.length} findings=${findings.length}`,
            );
            const candidates = holdCandidates(placed).filter((c) => chosen.has(c.scene));
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

      /**
       * The short's page, `workers` of it, and the short resolved on the rate
       * that page declares: the frames the renderer draws, never an assumed 30.
       */
      const onPage = Effect.fnUntraced(function* (
        film: LoadedFilm,
        declared: Short,
        workers: number,
      ) {
        const placed = yield* placeFilm(film);
        const pool = yield* pages.open(shortKey(film.paths.name, declared.id), {
          workers,
          captions: true,
        });
        const info = pool.info;
        const cut = yield* Effect.fromResult(resolveShort(placed, declared, info.fps));
        return { pool, info, cut, phrases: shortPhrases(placed, cut) };
      });

      const cut = Effect.fn('Checker.cut')(function* (film: LoadedFilm, declared: Short) {
        return (yield* Effect.scoped(onPage(film, declared, 1))).cut;
      });

      const short = Effect.fn('Checker.short')(function* (
        film: LoadedFilm,
        declared: Short,
        options: ShortCheckOptions,
      ) {
        const name = film.paths.name;
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const workers = Math.max(1, options.workers);
            const { pool, info, cut, phrases } = yield* onPage(film, declared, workers);
            const words = shortStaticFindings(cut, phrases);
            if (options.static) return words;
            // The short's page is named for the short: the film's title and size are on the film's page.
            const { title, band } = yield* Effect.map(
              pages.open(name, { workers: 1, captions: true }),
              (whole) => ({ title: whole.title, band: bandOf(whole.info) }),
            );
            const k = info.width / SHORT_WIDTH;
            const probeAt = (i: number) => pool.call('probe', i);
            const frames = zoneFrames(cut, phrases);
            const probed = yield* Effect.forEach(frames, probeAt, { concurrency: workers });
            const unsafe = mergeUnsafe(
              Arr.zip(frames, probed).flatMap(([i, p]) =>
                unsafeTexts(cut.id, options.zone, i / info.fps, p, k),
              ),
            );
            const open = yield* Effect.forEach(openFrames(info.fps), probeAt, {
              concurrency: workers,
            });
            const titled = Option.flatMap(Arr.head(open), (first) =>
              titleOpen(cut.id, first, title),
            );
            // The film's frame alone, where the page draws it: the hook and captions are the short's, and differ by design.
            const frame: LumaArea = {
              x: 0,
              y: band.top,
              w: band.width,
              h: band.height,
              ...SHORT_RULES.loopGrid,
            };
            const lumaAt = (i: number) => pool.use((page) => lumaOf(page, i, frame));
            const [first, last] = yield* Effect.all([lumaAt(0), lumaAt(info.frames - 1)], {
              concurrency: 2,
            });
            const findings = [
              ...words,
              ...unsafe,
              ...Option.toArray(stillOpen(cut.id, open, SHORT_RULES.motionBy)),
              ...Option.toArray(titled),
              ...Option.toArray(loopPicture(cut.id, first, last)),
            ];
            yield* Effect.log(
              `check.short film=${name} short=${cut.id} zone=${options.zone} frames=${frames.length + open.length + 2} loop=${lumaDiff(first, last).toFixed(3)} findings=${findings.length}`,
            );
            return findings;
          }),
        );
      });

      return Checker.of({ layout, cut, short });
    }),
  ).pipe(Layer.provide(Pages.layer));
}
