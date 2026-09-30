// The look pass: every scene drawn small at 2 fps in a pool of headless pages
// (the player's `look` handle), then every frame across each hand's travel
// (the hands pass), and measured by the pure functions in `look.ts`.
// `film check` warns from it (`HeldShare`, `FaceSmall`, `ColourScript`,
// `HandJump`, `HandFar`, `HandHidden`); `film lookbook` prints it. The server,
// the browser and the pages live in one scope, as in a render.

import { Array as Arr, Context, Effect, Layer, Pool } from 'effect';
import type { Scope } from '../core/address.ts';
import { Browser, type PageOpenError } from './browser.ts';
import type { FrameFailed, PageCrashed, PageError } from './errors.ts';
import type { LoadedFilm } from './film-repo.ts';
import {
  type Drawn,
  type HandFrame,
  type LookSample,
  type Looked,
  THUMB_H,
  THUMB_W,
  farHands,
  handJumps,
  handSpans,
  hiddenHands,
  lookSamples,
  sceneLooks,
} from './look.ts';
import { PreviewServer } from './preview-server.ts';

export type LookError = PageOpenError | PageError | PageCrashed | FrameFailed;

/** Frames one page draws per call. */
const BATCH = 40;
/** The hands pass keeps no picture: its thumbs are one pixel. */
const HANDS_THUMB = 1;

export interface LookerService {
  /**
   * Draw the scenes `scope` covers (`resolveAddress`: every one for the whole
   * film) at 2 fps, small, on `workers` pages, and measure each.
   */
  readonly look: (
    film: LoadedFilm,
    workers: number,
    scope: Scope,
  ) => Effect.Effect<Looked, LookError>;
}

export class Looker extends Context.Service<Looker, LookerService>()('@bible/film/tools/Looker') {
  static readonly layer = Layer.effect(
    Looker,
    Effect.gen(function* () {
      const browser = yield* Browser;
      const server = yield* PreviewServer;

      const look = Effect.fn('Looker.look')(function* (
        film: LoadedFilm,
        workers: number,
        scope: Scope,
      ) {
        const placed = scope.scenes;
        const url = `${server.url}?film=${encodeURIComponent(film.paths.name)}&export`;
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const size = Math.max(1, workers);
            const pool = yield* Pool.make({ acquire: browser.open(url), size });
            const info = yield* Effect.scoped(Effect.map(Pool.get(pool), (page) => page.info));
            /** `samples` drawn on the pool, each as a `w` × `h` thumb, in order. */
            const drawAll = (samples: ReadonlyArray<LookSample>, w: number, h: number) =>
              Effect.map(
                Effect.forEach(
                  Arr.chunksOf(
                    samples.map((s) => s.frame),
                    BATCH,
                  ),
                  (frames) =>
                    Effect.scoped(
                      Effect.gen(function* () {
                        const page = yield* Pool.get(pool);
                        const got = yield* page.look(frames, w, h);
                        const bytes = w * h * 4;
                        return frames.map((_, k): Drawn => ({
                          thumb: got.thumbs.subarray(k * bytes, (k + 1) * bytes),
                          faces: got.faces[k] ?? [],
                          hands: got.hands[k] ?? [],
                        }));
                      }),
                    ),
                  { concurrency: size },
                ),
                (batches) => batches.flat(),
              );
            const handsOf = (samples: ReadonlyArray<LookSample>, drawn: ReadonlyArray<Drawn>) =>
              Arr.zipWith(samples, drawn, (s, d): HandFrame => ({ ...s, hands: d.hands }));
            const samples = lookSamples(placed, info.fps, info.frames);
            const drawn = yield* drawAll(samples, THUMB_W, THUMB_H);
            yield* Effect.log(`look.done film=${film.paths.name} frames=${samples.length}`);
            // Hands: every frame across each hand's travel or change of work
            // between two samples, so a hand that jumps is seen between the
            // frames it jumps in.
            const coarse = handsOf(samples, drawn);
            const spans = handSpans(coarse, info.fps);
            const fine = handsOf(spans, yield* drawAll(spans, HANDS_THUMB, HANDS_THUMB));
            yield* Effect.log(`look.hands film=${film.paths.name} frames=${spans.length}`);
            return {
              looks: sceneLooks(placed, samples, drawn, info),
              height: info.height,
              jumps: handJumps(fine),
              far: farHands([...coarse, ...fine]),
              hidden: hiddenHands([...coarse, ...fine]),
            };
          }),
        );
      });

      return Looker.of({ look });
    }),
  );
}
