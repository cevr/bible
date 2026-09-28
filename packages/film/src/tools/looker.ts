// The look pass: every scene drawn small at 2 fps in a pool of headless pages
// (the player's `look` handle), and measured by the pure functions in
// `look.ts`. `film check` warns from it (`HeldShare`, `FaceSmall`,
// `ColourScript`); `film lookbook` prints it. The server, the browser and the
// pages live in one scope, as in a render.

import { Array as Arr, Context, Effect, Layer, Option, Pool } from 'effect';
import { Browser, type PageOpenError } from './browser.ts';
import type { FrameFailed, PageCrashed, PageError } from './errors.ts';
import { type LoadedFilm, type PlaceError, placeFilm } from './film-repo.ts';
import {
  type Drawn,
  type Looked,
  THUMB_BYTES,
  THUMB_H,
  THUMB_W,
  lookSamples,
  sceneLooks,
} from './look.ts';
import { PreviewServer } from './preview-server.ts';

export type LookError = PageOpenError | PageError | PageCrashed | FrameFailed | PlaceError;

/** Frames one page draws per call. */
const BATCH = 40;

export interface LookerService {
  /**
   * Draw every scene (or only `scenes`) at 2 fps, small, on `workers` pages,
   * and measure each.
   */
  readonly look: (
    film: LoadedFilm,
    workers: number,
    scenes: Option.Option<ReadonlySet<string>>,
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
        scenes: Option.Option<ReadonlySet<string>>,
      ) {
        const all = yield* placeFilm(film);
        const placed = Option.match(scenes, {
          onNone: () => all,
          onSome: (ids) => all.filter((p) => ids.has(p.spec.id)),
        });
        const url = `${server.url}?film=${encodeURIComponent(film.paths.name)}&export`;
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const size = Math.max(1, workers);
            const pool = yield* Pool.make({ acquire: browser.open(url), size });
            const info = yield* Effect.scoped(Effect.map(Pool.get(pool), (page) => page.info));
            const samples = lookSamples(placed, info.fps, info.frames);
            const batches = Arr.chunksOf(
              samples.map((s) => s.frame),
              BATCH,
            );
            const drawn = yield* Effect.forEach(
              batches,
              (frames) =>
                Effect.scoped(
                  Effect.gen(function* () {
                    const page = yield* Pool.get(pool);
                    const got = yield* page.look(frames, THUMB_W, THUMB_H);
                    return frames.map((_, k): Drawn => ({
                      thumb: got.thumbs.subarray(k * THUMB_BYTES, (k + 1) * THUMB_BYTES),
                      faces: got.faces[k] ?? [],
                    }));
                  }),
                ),
              { concurrency: size },
            );
            yield* Effect.log(`look.done film=${film.paths.name} frames=${samples.length}`);
            return {
              looks: sceneLooks(placed, samples, drawn.flat(), info),
              height: info.height,
            };
          }),
        );
      });

      return Looker.of({ look });
    }),
  );
}
