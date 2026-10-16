// Footage: the camera frames a frame of a talk draws. A film says what each
// frame reads (`Film.footageAt`, pure), and the host decodes those frames
// before the frame is drawn, handing them over as `RenderOptions.footage`,
// so the draw stays synchronous and the film keeps nothing between frames:
// any reuse of a decoded frame lives here, in the host, as `frame-pane.ts`
// holds the frames it has decoded. A drawn film reads no footage: every
// caller draws it at once, as it always has (`readsFootage`).
//
// Two ways in. `ready` decodes the frames one frame reads: a still, a seek,
// a probe, a look. `run` decodes a run of frames in order, each source's
// packets decoded at most once, as an export chunk draws them. A frame the
// host cannot decode fails with `FootageFrameMissing`, never drawn black.
// The live adapter is `footage-browser.ts` (mediabunny); a test, or a
// draw check, gives frames of its own (`Footage.layerOver`).

import { Context, Data, Effect, Layer, Option } from 'effect';
import type { Scope } from 'effect';
import type { Film, FootageFrames, FootageRead, RenderOptions } from '../canvas/film.ts';
import type { Ask } from '../core/asked.ts';

/** A footage frame the host could not decode for a frame: named, so the frame is never drawn black. */
export class FootageFrameMissing extends Data.TaggedError('FootageFrameMissing')<{
  readonly source: string;
  readonly at: number;
  readonly why: string;
}> {
  override get message() {
    return `footage ${this.source} has no frame at ${this.at.toFixed(3)} s: ${this.why}`;
  }
}

/** A run of frames' footage, decoded in order (`Footage.run`). */
interface FootageRun {
  /** The next frame's footage: valid until the following `next`, or the run's scope closing. */
  readonly next: Effect.Effect<FootageFrames, FootageFrameMissing>;
}

interface FootageOps {
  /**
   * The frames `reads` name, decoded: what one frame draws. They are the
   * caller's to draw at once, in the turn the answer lands in.
   */
  readonly ready: (
    reads: ReadonlyArray<FootageRead>,
  ) => Effect.Effect<FootageFrames, FootageFrameMissing>;
  /**
   * A run of frames, each frame's reads in `frames`, decoded in that order
   * (each source's packets at most once while its times rise): what an
   * export chunk draws. Its decoders are let go when the scope closes.
   */
  readonly run: (
    frames: ReadonlyArray<ReadonlyArray<FootageRead>>,
  ) => Effect.Effect<FootageRun, never, Scope.Scope>;
}

/** The frames of `reads` from `frameOf`, the first it has none for named. */
const framesOf = (
  reads: ReadonlyArray<FootageRead>,
  frameOf: (read: FootageRead) => Option.Option<CanvasImageSource>,
): Effect.Effect<FootageFrames, FootageFrameMissing> =>
  Option.match(Option.fromUndefinedOr(reads.find((read) => Option.isNone(frameOf(read)))), {
    onNone: () =>
      Effect.succeed({ frame: (read: FootageRead) => Option.getOrUndefined(frameOf(read)) }),
    onSome: (missing) => Effect.fail(new FootageFrameMissing({ ...missing, why: 'no such frame' })),
  });

export class Footage extends Context.Service<Footage, FootageOps>()('@bible/film/browser/Footage') {
  /**
   * Footage from `frameOf`, a picture per read or none: a test's frames, or
   * the draw check's stand-ins. A read it has none for fails as missing.
   */
  static readonly layerOver = (
    frameOf: (read: FootageRead) => Option.Option<CanvasImageSource>,
  ): Layer.Layer<Footage> =>
    Layer.succeed(
      Footage,
      Footage.of({
        ready: (reads) => framesOf(reads, frameOf),
        run: (frames) =>
          Effect.sync(() => {
            let k = 0;
            return {
              next: Effect.suspend(() => {
                const reads = Option.getOrElse(Option.fromUndefinedOr(frames[k]), () => []);
                k += 1;
                return framesOf(reads, frameOf);
              }),
            };
          }),
      }),
    );

  /** No footage at all: a page rendered on the server, which decodes nothing. Every read is missing. */
  static readonly none: Layer.Layer<Footage> = Footage.layerOver(() => Option.none());
}

/** What footage adds to a frame's options: its decoded frames, or nothing for a film that reads none. */
export type FootageShown = Pick<RenderOptions, 'footage'>;

/** A film that reads no footage is shown with nothing added. */
const NONE: FootageShown = {};

/** What `film`'s frames read, if it reads footage at all: a drawn film does not. */
export const footageReads = (
  film: Pick<Film, 'footageAt'>,
): Option.Option<(T: number) => ReadonlyArray<FootageRead>> =>
  Option.fromUndefinedOr(film.footageAt);

/** Whether `film` reads footage at all: a drawn film does not, and is drawn at once. */
export const readsFootage = (film: Pick<Film, 'footageAt'>): boolean =>
  Option.isSome(footageReads(film));

/** Frame `T` of `film`'s footage, decoded: nothing, at once, for a film that reads none. */
export const footageAt = (
  film: Pick<Film, 'footageAt'>,
  T: number,
): Effect.Effect<FootageShown, FootageFrameMissing, Footage> =>
  Option.match(footageReads(film), {
    onNone: () => Effect.succeed(NONE),
    onSome: (reads) =>
      Effect.map(
        Footage.use((footage) => footage.ready(reads(T))),
        (footage): FootageShown => ({ footage }),
      ),
  });

/**
 * Frame `T` of `film` painted by `paint`, with its footage decoded first (at
 * once for a film that reads none): it resolves once the frame is painted,
 * so whatever reads the canvas after it (a note's still, the onion) reads
 * this frame.
 */
const paintedAt = (
  film: Pick<Film, 'footageAt'>,
  T: number,
  paint: (shown: FootageShown) => void,
): Effect.Effect<void, FootageFrameMissing, Footage> =>
  Effect.flatMap(footageAt(film, T), (shown) => Effect.sync(() => paint(shown)));

/**
 * `paintedAt` for one ask of a surface's frames (an `Ask` of the surface's
 * `newestAsked`, `core/asked.ts`): its frame painted through `answer`, and
 * its failure said, only while nothing was asked after it, as `<video>`
 * drops frames rather than show an old one late. An older ask whose footage
 * lands after a newer one's paints nothing and fails nothing, so a decode
 * that lands late never paints over a newer frame, and a frame no longer
 * asked for never says it failed.
 */
export const paintedIfNewest = (
  film: Pick<Film, 'footageAt'>,
  T: number,
  paint: (shown: FootageShown) => void,
  ask: Ask,
): Effect.Effect<void, FootageFrameMissing, Footage> =>
  paintedAt(film, T, (shown) => {
    if (!ask.overtaken()) ask.answer(() => paint(shown));
  }).pipe(
    Effect.catchTag('FootageFrameMissing', (missing) =>
      Effect.suspend(() => {
        if (ask.overtaken()) return Effect.void;
        return Effect.fail(missing);
      }),
    ),
  );
