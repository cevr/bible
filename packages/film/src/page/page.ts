// The film's page: the built .riv drawn in headless Chromium as a pure
// function of time. Frame `i` sets the Film's timeline to `i / fps` and draws
// it; nothing plays on its own, so one frame is always one image. The renderer
// drives it through `window.__film` (tools/browser.ts). `?fps=` sets the rate
// it samples the timeline at, and `?duration=` is the Film's length in seconds,
// which `sync` wrote from the layout (the runtime does not expose a
// timeline's length).

import RiveCanvas from '@rive-app/canvas-advanced';
import { composeContact } from './contact.ts';
import { type EncoderCheck, encodeChunk, encoderCheck } from './encode.ts';

/** The Film artboard and its timeline (core/film-board.ts, `FILM`, `FILM_TIMELINE`). */
const FILM = 'Film';
const FILM_TIMELINE = 'film';

export interface FilmHandle {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  /** The Film's timeline, in seconds. */
  readonly duration: number;
  readonly frames: number;
  /** Draw frame `i` and return it encoded, as base64. */
  frame(i: number, type?: 'image/png' | 'image/jpeg'): Promise<string>;
  /** Whether the film can be encoded here at `scale` (`encoderCheck`). */
  encoder(scale: number): Promise<EncoderCheck>;
  /**
   * Frames `[from, to)` encoded as an H.264 MP4 at `scale` (`encodeChunk`), and
   * with `share` a small copy beside it, each as base64.
   */
  encode(
    from: number,
    to: number,
    scale: number,
    share: boolean,
  ): Promise<{ readonly master: string; readonly share?: string }>;
  /** `frames` tiled into the contact sheet (`composeContact`), as a base64 JPEG. */
  contact(frames: ReadonlyArray<number>): Promise<string>;
}

declare global {
  interface Window {
    __film?: FilmHandle;
  }
}

/** Bytes as base64: what the handle hands back across `page.evaluate`. */
const base64 = (bytes: Uint8Array) => {
  let bin = '';
  for (let k = 0; k < bytes.length; k += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return btoa(bin);
};

/** A canvas as base64 PNG or JPEG. */
const encodeImage = async (canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg') => {
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.95));
  if (blob === null) throw new Error('toBlob failed');
  return base64(new Uint8Array(await blob.arrayBuffer()));
};

const main = async () => {
  const params = new URLSearchParams(location.search);
  const fps = Number(params.get('fps') ?? '30');
  const duration = Number(params.get('duration') ?? 'NaN');
  const rive = await RiveCanvas({ locateFile: () => '/rive.wasm' });
  const bytes = new Uint8Array(await (await fetch('/film.riv')).arrayBuffer());
  const file = await rive.load(bytes);
  const artboard = file.artboardByName(FILM);
  const timeline = new rive.LinearAnimationInstance(
    artboard.animationByName(FILM_TIMELINE),
    artboard,
  );

  const canvas = document.getElementById('film');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('no canvas');
  const { minX, minY, maxX, maxY } = artboard.bounds;
  canvas.width = maxX - minX;
  canvas.height = maxY - minY;
  const renderer = rive.makeRenderer(canvas);

  const draw = (i: number) => {
    timeline.time = i / fps;
    // Twice: a nested artboard shown by this frame's keys only takes its own
    // remapped time on the advance after the one that shows it.
    for (let pass = 0; pass < 2; pass++) {
      timeline.apply(1);
      artboard.advance(0);
    }
    renderer.beginFrame(true);
    renderer.save();
    artboard.draw(renderer);
    renderer.restore();
    rive.resolveAnimationFrame();
  };

  window.__film = {
    width: canvas.width,
    height: canvas.height,
    fps,
    duration,
    frames: Math.ceil(duration * fps),
    frame: (i, type = 'image/png') => {
      draw(i);
      return encodeImage(canvas, type);
    },
    encoder: (scale) => encoderCheck(canvas, fps, scale),
    encode: async (from, to, scale, share) => {
      const chunk = await encodeChunk(draw, canvas, fps, from, to, scale, share);
      const master = base64(chunk.master);
      return chunk.share === undefined ? { master } : { master, share: base64(chunk.share) };
    },
    contact: (frames) => encodeImage(composeContact(draw, canvas, frames), 'image/jpeg'),
  };
};

main().catch((e: unknown) => {
  document.body.innerHTML = `<pre style="color:#f88;padding:24px;white-space:pre-wrap">${String(e instanceof Error ? (e.stack ?? e.message) : e)}</pre>`;
  throw e;
});
