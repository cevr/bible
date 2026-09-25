// The layout leg of `film check`: the player draws each sampled frame with the
// text probe on, in a pool of headless pages, and the pure detectors in
// `check.ts` read the boxes it reports. The server, the browser and the pages
// live in one scope, as in a render.

import { Context, Effect, Layer, Option, Pool } from 'effect';
import { Browser, type PageOpenError } from './browser.ts';
import {
  type LayoutFinding,
  type Sample,
  frameFindings,
  platesOffFrame,
  layoutSamples,
  mergeFindings,
} from './check.ts';
import type { FrameFailed, LayoutInvalid, PageCrashed, PageError } from './errors.ts';
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

export interface CheckerService {
  /** Probe every sampled frame and return what collides, one finding per pair and scene. */
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
            const samples = layoutSamples(placed, info.fps).filter((s) =>
              Option.match(options.scenes, {
                onNone: () => true,
                onSome: (ids) => ids.has(s.scene),
              }),
            );
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
            return findings;
          }),
        );
      });

      return Checker.of({ layout });
    }),
  );
}
