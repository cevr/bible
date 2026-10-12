// Browser side of rive.pixel.test.ts: the fixture rig (`fixtures/arm.ts`)
// drawn by the `webgl2` engine through a fixture film, loaded as a page loads
// a film's rigs (the page's Rive runtimes, the `.riv` through its `fetch`
// client). `riveFrames` draws, for each target time, a history of frames and
// then the target, and hands back each target frame's pixels as a hash, and
// how many pixels of the rig's box differ from the same frame with the rig
// left out.

import { Effect, Layer, Scope } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { offscreen } from '../paper.ts';
import { armFilm, armScene } from './arm.ts';
import { loadRigs } from '../../rive/load.ts';
import { RiveRuntimeBrowser } from '../../rive/runtime-browser.ts';

export interface RiveFrame {
  readonly at: number;
  /** FNV-1a of the frame's RGBA bytes. */
  readonly hash: string;
  /** Pixels of the rig's box that differ from the frame drawn without the rig. */
  readonly rigPixels: number;
}

/** The film with the arm, and the same film without it: its scene draws nothing. */
const film = armFilm([armScene('arm', 'webgl2')]);
const bare = armFilm([{ id: 'arm', min: 4, draw: () => {} }]);

/** The page's load of the film's rigs: a scope never closed, as a page's film keeps them. */
const loaded = Effect.runPromise(
  Effect.flatMap(Scope.make(), (scope) => Scope.provide(loadRigs(film), scope)).pipe(
    Effect.provide(Layer.provideMerge(RiveRuntimeBrowser, FetchHttpClient.layer)),
  ),
);

const frame = offscreen(film.width, film.height);
const empty = offscreen(film.width, film.height);

/** FNV-1a over `bytes`. */
const fnv = (bytes: Uint8ClampedArray) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ (bytes[i] ?? 0), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
};

/** The rig's box on the frame: the arm's 200 × 200 artboard, twice its size, at the centre. */
const BOX = { x: film.width / 2 - 200, y: film.height / 2 - 200, w: 400, h: 400 };

/** Each target drawn after `history`, as hashes, and its rig's pixels against the bare frame. */
const riveFrames = (history: ReadonlyArray<number>, targets: ReadonlyArray<number>) =>
  loaded.then(() =>
    targets.map((at): RiveFrame => {
      for (const t of history) film.render(frame.ctx, t);
      film.render(frame.ctx, at);
      bare.render(empty.ctx, at);
      const drawn = frame.ctx.getImageData(0, 0, film.width, film.height).data;
      const a = frame.ctx.getImageData(BOX.x, BOX.y, BOX.w, BOX.h).data;
      const b = empty.ctx.getImageData(BOX.x, BOX.y, BOX.w, BOX.h).data;
      let rigPixels = 0;
      for (let i = 0; i < a.length; i += 4)
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) rigPixels += 1;
      return { at, hash: fnv(drawn), rigPixels };
    }),
  );

Object.assign(window, { riveFrames });
