// The layout leg of `film check`: the player draws each sampled frame with the
// text probe on, in a pool of headless pages, and the pure detectors in
// `check.ts` read the boxes it reports. Then it probes across each stretch the
// static leg names as a hold candidate, to tell a still picture from motion
// no cue declares. The server, the browser and the pages live in one scope, as
// in a render.

import { Array as Arr, Context, Effect, Layer, Option, Pool } from 'effect';
import { Browser, type FramePage, type PageOpenError } from './browser.ts';
import {
  HOLD,
  type HoldCandidate,
  type LayoutFinding,
  type Sample,
  frameFindings,
  heldStill,
  holdCandidates,
  holdFrames,
  platesOffFrame,
  layoutSamples,
  mergeFindings,
} from './check.ts';
import {
  type FrameFailed,
  type LayoutInvalid,
  type PageCrashed,
  type PageError,
  StaticHold,
} from './errors.ts';
import { type LoadedFilm, placeFilm } from './film-repo.ts';
import { PreviewServer } from './preview-server.ts';

export type LayoutCheckError =
  | PageOpenError
  | PageError
  | PageCrashed
  | FrameFailed
  | LayoutInvalid;

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

/**
 * A hold candidate is a `StaticHold` when every frame probed across it holds
 * still against its first. The frames are probed one after another, and the
 * first that moves ends it: most candidates move within two frames.
 */
const confirmHold = (
  pool: Pool.Pool<FramePage, PageOpenError>,
  fps: number,
  hold: HoldCandidate,
): Effect.Effect<
  ReadonlyArray<StaticHold>,
  PageOpenError | PageError | PageCrashed | FrameFailed
> =>
  Effect.gen(function* () {
    const probeAt = (i: number) =>
      Effect.scoped(Effect.flatMap(Pool.get(pool), (page) => page.probe(i)));
    const frames = holdFrames(hold, fps);
    if (!Arr.isReadonlyArrayNonEmpty(frames)) return [];
    const [first, ...rest] = frames;
    const base = yield* probeAt(first);
    for (const i of rest) {
      const next = yield* probeAt(i);
      if (!heldStill([base, next], hold.captions)) return [];
    }
    return [StaticHold.make({ scene: hold.scene, from: hold.from, to: hold.to, max: HOLD })];
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
            const holds = (yield* Effect.forEach(
              candidates,
              (hold) => confirmHold(pool, info.fps, hold),
              { concurrency: workers },
            )).flat();
            yield* Effect.log(
              `check.hold film=${film.paths.name} candidates=${candidates.length} holds=${holds.length}`,
            );
            return [...findings, ...holds];
          }),
        );
      });

      return Checker.of({ layout });
    }),
  );
}
