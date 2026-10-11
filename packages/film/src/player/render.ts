// The render page, framework-free: an app's `index.html` (the lab's export
// place `/films/<name>/export`, or the PreviewServer's `/?film=<name>&export`) calls
// `mountRender(films)`: the film with no chrome, and `window.__film` for the
// renderer and the easel. Its own module, so the encoder
// (`encode.ts`, mediabunny) is the render page's alone: the studio's pages,
// which mount the preview (`main.ts`), never load it.

import type { Film, RenderOptions } from '../canvas/film.ts';
import type { ProbeSink } from '../canvas/probe.ts';
import { Footage, type FootageShown, footageAt, footageReads } from '../browser/footage.ts';
import type { ExportHandle } from '../core/export-handle.ts';
import { sceneTimesOf } from '../core/easel.ts';
import { frameAtOrAfter } from '../core/time.ts';
import { Effect, Option } from 'effect';
import { addressOn, hostOf, monotonicMs } from '../browser/host.ts';
import type { Host } from '../browser/host.ts';
import { BrowserHost } from '../browser/host-browser.ts';
import { composeContact } from './contact.ts';
import { composeStill } from './still.ts';
import { bytesBase64, canvasBase64, canvasLuma, showFailure } from './dom.ts';
import { encodeChunk, encoderChoice } from './encode.ts';
import { pictureFacesWait } from './face.ts';
import { composeLookbook } from './lookbook-sheet.ts';
import { lookFrames } from './look-frames.ts';
import { type Films, type Staged, stageFilm } from './main.ts';

declare global {
  interface Window {
    __film?: ExportHandle;
  }
}

/**
 * Mount the render page for `films` (the film its address names): the film
 * staged with no chrome and no UI face, drawing only the film's own faces,
 * and, once they have loaded, the handle the renderer drives on
 * `window.__film`.
 */
export const mountRender = (films: Films): void => {
  const host = hostOf(BrowserHost.render);
  stageFilm(films, addressOn(host).href())
    .then((staged) =>
      Effect.runPromise(
        Option.getOrElse(pictureFacesWait(document.fonts), () => Effect.void).pipe(
          Effect.as(staged),
        ),
      ),
    )
    .then((staged) => {
      document.body.classList.add('export');
      window.__film = exportHandle(staged, host);
    })
    .catch((e: unknown) => {
      showFailure(e);
      throw e;
    });
};

/**
 * `use` given each of `times`' footage in turn (`next`, once per time, in
 * order), decoded as one run (`Footage.run`): an export chunk's frames. The
 * run's decoders are let go when `use` settles. A film that reads none is
 * given nothing for every time, with no decoder made.
 */
const withFootageRun = <A>(
  host: Host,
  film: Film,
  times: ReadonlyArray<number>,
  use: (next: () => Promise<FootageShown>) => Promise<A>,
): Promise<A> =>
  Option.match(footageReads(film), {
    onNone: () => use(() => Promise.resolve({})),
    onSome: (reads) =>
      Effect.runPromiseWith(host)(
        Effect.scoped(
          Effect.gen(function* () {
            const run = yield* Footage.use((footage) => footage.run(times.map(reads)));
            const context = yield* Effect.context<Footage>();
            const next = () =>
              Effect.runPromiseWith(context)(
                Effect.map(run.next, (footage): FootageShown => ({ footage })),
              );
            // `use`'s own failure (a frame missing, an encoder's) is the caller's, as it was thrown.
            return yield* Effect.promise(() => use(next));
          }),
        ),
      ),
  });

/**
 * The handle the tools drive a staged film through (`ExportHandle`,
 * core/export-handle.ts). Every draw is timed the same way (`drawn`): the
 * frame drawn, then rastered by a one-pixel read before the clock stops, so
 * the canvas's recorded drawing is paid for in the draw and not later by
 * whatever reads the canvas next (an encoder, `toBlob`).
 */
const exportHandle = ({ film, canvas, ctx, captions }: Staged, host: Host): ExportHandle => {
  /** The page clock in ms (`monotonicMs`): what every draw and encode is timed by. */
  const nowMs = monotonicMs(host);
  /** Frame `i`'s footage, decoded (nothing, at once, for a film that reads none). */
  const footageOf = (i: number) => Effect.runPromiseWith(host)(footageAt(film, i / film.fps));
  /** Frame `i` drawn with its footage and `extra` options. */
  const drawWith = (i: number, shown: FootageShown, extra: RenderOptions = {}) =>
    film.render(ctx, i / film.fps, { captions: captions.on, ...shown, ...extra });
  /** Frame `i` drawn, once its footage is decoded. */
  const draw = async (i: number) => drawWith(i, await footageOf(i));
  /** Draw frame `i` with its decoded footage and raster it: the ms it took, the decoding not in it. */
  const drawn = (i: number, shown: FootageShown) => {
    const began = nowMs();
    drawWith(i, shown);
    ctx.getImageData(0, 0, 1, 1);
    return nowMs() - began;
  };
  return {
    info: {
      width: film.width,
      height: film.height,
      fps: film.fps,
      duration: film.duration,
      frames: frameAtOrAfter(film.duration, film.fps),
      audio: film.audio,
    },
    frame: async (i, type) => {
      await draw(i);
      return canvasBase64(canvas, type);
    },
    probe: async (i) => {
      const sink: ProbeSink = { texts: [], inks: [] };
      drawWith(i, await footageOf(i), { probe: sink });
      return sink;
    },
    lookbook: async (type) =>
      canvasBase64(
        (await composeLookbook(film, { captions: captions.on, footage: host })).canvas,
        type,
      ),
    encoder: (scale, share, candidates) =>
      encoderChoice(canvas, film.fps, scale, share, candidates),
    encode: async (from, to, scale, share, encoder) => {
      const began = nowMs();
      let drawing = 0;
      // The chunk's frames' footage is decoded as one run, each packet at most once.
      const times = Array.from({ length: to - from }, (_, k) => (from + k) / film.fps);
      const chunk = await withFootageRun(host, film, times, (next) =>
        encodeChunk(
          async (i) => {
            drawing += drawn(i, await next());
          },
          canvas,
          film.fps,
          from,
          to,
          scale,
          share,
          encoder,
        ),
      );
      const master = bytesBase64(chunk.master);
      const copy = chunk.share === undefined ? {} : { share: bytesBase64(chunk.share) };
      return { master, ...copy, timing: { draw: drawing, page: nowMs() - began } };
    },
    contact: async (frames) =>
      canvasBase64(await composeContact(draw, canvas, frames), 'image/jpeg'),
    look: async (frames, w, h) => {
      const shot = await lookFrames(
        async (i, probe) => drawWith(i, await footageOf(i), { captions: false, probe }),
        canvas,
        frames,
        w,
        h,
      );
      return { thumbs: bytesBase64(shot.thumbs), faces: shot.faces, hands: shot.hands };
    },
    luma: async (i, area) => {
      await draw(i);
      return canvasLuma(canvas, area);
    },
    // One frame at a time, each timed alone: its footage decoded before its clock starts.
    drawTimes: (frames) =>
      frames.reduce<Promise<ReadonlyArray<number>>>(
        async (before, i) => [...(await before), drawn(i, await footageOf(i))],
        Promise.resolve([]),
      ),
    scenes: () => film.placed.map(sceneTimesOf),
    still: async (i, view) => {
      drawWith(i, await footageOf(i), { captions: view.captions });
      return canvasBase64(composeStill(canvas, view), view.format);
    },
  };
};
