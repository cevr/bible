// Browser side of rive.pixel.test.ts: the fixture rig (`fixtures/arm.ts`)
// drawn by the `webgl2` engine through a fixture film, loaded as a page loads
// a film's rigs (the page's Rive runtimes, the `.riv` through its `fetch`
// client). `riveFrames` draws, for each target time, a history of frames and
// then the target, and hands back each target frame's pixels as a hash, and
// how many pixels of the rig's box differ from the same frame with the rig
// left out. `riveAfterLoss` draws a time, has the rig's WebGL context lost
// (by the browser's cap on live contexts, or by the page's budget that
// `glCanvas` shares), and draws it again.

import { Effect, Layer, Scope } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { glCanvas } from '../gl.ts';
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

/** Every WebGL 2 context the page makes (the rig's targets among them), in the order made. */
const contexts: Array<WebGL2RenderingContext> = [];
const contextOf = HTMLCanvasElement.prototype.getContext;
const isGl2 = (v: unknown): v is WebGL2RenderingContext =>
  v !== null && v !== undefined && Reflect.has(Object(v), 'isContextLost');
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value(this: HTMLCanvasElement, ...args: Parameters<HTMLCanvasElement['getContext']>) {
    const made: unknown = Reflect.apply(contextOf, this, args);
    if (args[0] === 'webgl2' && isGl2(made)) contexts.push(made);
    return made;
  },
});

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

/** A time drawn, its rig's contexts lost, then drawn again. */
export interface AfterLoss {
  readonly before: string;
  readonly after: string;
  /** How many of the contexts the rig had drawn with were lost before the second draw. */
  readonly lost: number;
}

/** Contexts the page makes past the rig's: kept, so the browser cannot collect them. */
const crowd: Array<unknown> = [];

/**
 * Draw `at`, then lose the rig's contexts `how`: `cap` makes 16 more WebGL
 * contexts (the browser's cap, so it drops its oldest); `budget` asks
 * `glCanvas` for 8 keys (the page's budget, which lets the longest unused go).
 * Then draw `at` again.
 */
const riveAfterLoss = (at: number, how: 'cap' | 'budget') =>
  loaded.then((): AfterLoss => {
    film.render(frame.ctx, at);
    const before = fnv(frame.ctx.getImageData(0, 0, film.width, film.height).data);
    const rigs = [...contexts];
    for (let i = 0; i < (how === 'cap' ? 16 : 0); i++) {
      const canvas = document.createElement('canvas');
      crowd.push(canvas, canvas.getContext('webgl2'));
    }
    for (let i = 0; i < (how === 'budget' ? 8 : 0); i++)
      crowd.push(glCanvas(`rive-pixels/${i}`, 4, 4));
    const lost = rigs.filter((gl) => gl.isContextLost()).length;
    film.render(frame.ctx, at);
    const after = fnv(frame.ctx.getImageData(0, 0, film.width, film.height).data);
    return { before, after, lost };
  });

Object.assign(window, { riveFrames, riveAfterLoss });
