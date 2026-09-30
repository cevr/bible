// The look pass: every scene drawn small at 2 fps in a pool of headless pages
// (the player's `look` handle), then every frame across each hand's travel
// (the hands pass), and measured by the pure functions in `look.ts`.
// `film check` warns from it (`HeldShare`, `FaceSmall`, `ColourScript`,
// `HandJump`, `HandFar`, `HandHidden`); `film lookbook` prints it. The pages
// are a pool of `Pages`, in the look's scope, as in a render.

import { Array as Arr, Context, Effect, Layer } from 'effect';
import type { Scope } from '../core/address.ts';
import type { PageOpenError } from './browser.ts';
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
import { Pages } from './pages.ts';

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
      const pages = yield* Pages;

      const look = Effect.fn('Looker.look')(function* (
        film: LoadedFilm,
        workers: number,
        scope: Scope,
      ) {
        const placed = scope.scenes;
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const size = Math.max(1, workers);
            // The look handle draws without captions whatever the page's switch says.
            const pool = yield* pages.open(film.paths.name, { workers: size, captions: true });
            const info = pool.info;
            /** `samples` drawn on the pool, each as a `w` × `h` thumb, in order. */
            const drawAll = (samples: ReadonlyArray<LookSample>, w: number, h: number) =>
              Effect.map(
                Effect.forEach(
                  Arr.chunksOf(
                    samples.map((s) => s.frame),
                    BATCH,
                  ),
                  (frames) =>
                    Effect.map(pool.call('look', frames, w, h), (got) => {
                      const bytes = w * h * 4;
                      return frames.map((_, k): Drawn => ({
                        thumb: got.thumbs.subarray(k * bytes, (k + 1) * bytes),
                        faces: got.faces[k] ?? [],
                        hands: got.hands[k] ?? [],
                      }));
                    }),
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
  ).pipe(Layer.provide(Pages.layer));
}
