// The render page, framework-free: an app's `index.html`
// (`?film=<name>&export`) calls `mountRender(films)`: the film with no chrome,
// and `window.__film` for the renderer. Its own module, so the encoder
// (`encode.ts`, mediabunny) is the render page's alone: the studio's pages,
// which mount the preview (`main.ts`), never load it.

import type { ProbeSink } from '../canvas/probe.ts';
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
 * Mount the render page for `films` (`?film=<name>&export`): the film
 * staged with no chrome and no UI face, drawing only the film's own faces,
 * and, once they have loaded, the handle the renderer drives on
 * `window.__film`.
 */
export const mountRender = (films: Films): void => {
  const host = hostOf(BrowserHost.layer);
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
 * The handle the tools drive a staged film through (`ExportHandle`,
 * core/export-handle.ts). Every draw is timed the same way (`drawn`): the
 * frame drawn, then rastered by a one-pixel read before the clock stops, so
 * the canvas's recorded drawing is paid for in the draw and not later by
 * whatever reads the canvas next (an encoder, `toBlob`).
 */
const exportHandle = ({ film, canvas, ctx, captions }: Staged, host: Host): ExportHandle => {
  /** The page clock in ms (`monotonicMs`): what every draw and encode is timed by. */
  const nowMs = monotonicMs(host);
  const draw = (i: number) => film.render(ctx, i / film.fps, { captions: captions.on });
  /** Draw frame `i` and raster it: the ms it took. */
  const drawn = (i: number) => {
    const began = nowMs();
    draw(i);
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
    frame: (i, type) => {
      draw(i);
      return canvasBase64(canvas, type);
    },
    probe: (i) => {
      const sink: ProbeSink = { texts: [], inks: [] };
      film.render(ctx, i / film.fps, { captions: captions.on, probe: sink });
      return sink;
    },
    lookbook: async (type) =>
      canvasBase64((await composeLookbook(film, { captions: captions.on })).canvas, type),
    encoder: (scale, share, candidates) =>
      encoderChoice(canvas, film.fps, scale, share, candidates),
    encode: async (from, to, scale, share, encoder) => {
      const began = nowMs();
      let drawing = 0;
      const chunk = await encodeChunk(
        (i) => {
          drawing += drawn(i);
        },
        canvas,
        film.fps,
        from,
        to,
        scale,
        share,
        encoder,
      );
      const master = bytesBase64(chunk.master);
      const copy = chunk.share === undefined ? {} : { share: bytesBase64(chunk.share) };
      return { master, ...copy, timing: { draw: drawing, page: nowMs() - began } };
    },
    contact: (frames) => canvasBase64(composeContact(draw, canvas, frames), 'image/jpeg'),
    look: (frames, w, h) => {
      const shot = lookFrames(
        (i, probe) => film.render(ctx, i / film.fps, { captions: false, probe }),
        canvas,
        frames,
        w,
        h,
      );
      return { thumbs: bytesBase64(shot.thumbs), faces: shot.faces, hands: shot.hands };
    },
    luma: (i, area) => {
      draw(i);
      return canvasLuma(canvas, area);
    },
    drawTimes: (frames) => frames.map(drawn),
    scenes: () => film.placed.map(sceneTimesOf),
    still: (i, view) => {
      film.render(ctx, i / film.fps, { captions: view.captions });
      return canvasBase64(composeStill(canvas, view), view.format);
    },
  };
};
