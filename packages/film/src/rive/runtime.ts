// Rive's runtime as the film's load path reaches it (`RiveRuntime`): the
// wasm runtime an engine draws with, a rig's built file by the URL or path
// its module imported it as, and whether this host draws rigs at all. Two
// layers give it:
//
// - the page's (`runtime-browser.ts`): each engine's package and its wasm
//   from the package's asset URL, loaded with the first film that declares a
//   rig, and a `.riv` through the page's `HttpClient`;
// - Bun's (`runtime-bun.ts`), for `check --draw` and the tests: the WebGL 2
//   runtime for both engines (it poses as the Canvas 2D one does), its wasm
//   and a `.riv` read from the filesystem. Bun has no canvas, so a rig is
//   posed and its face declared, and nothing is drawn.

import type { RiveCanvas } from '@rive-app/webgl2-advanced';
import { Context, type Effect } from 'effect';
import type { RiveEngine } from '../canvas/rive.ts';
import type { RigUnloadable } from '../core/errors.ts';

/**
 * Rive for the film's loader. A failure names what was asked for (the
 * engine's runtime, the file's URL or path); the loader names the rig.
 */
export class RiveRuntime extends Context.Service<
  RiveRuntime,
  {
    /** The runtime `engine` draws with, made once for the layer. */
    readonly runtime: (engine: RiveEngine) => Effect.Effect<RiveCanvas, RigUnloadable>;
    /** A rig's built file, by the URL (a page) or the path (Bun) its module imported. */
    readonly read: (riv: string) => Effect.Effect<Uint8Array, RigUnloadable>;
    /** Whether rigs are drawn (a page), or only posed and their faces declared (Bun). */
    readonly paints: boolean;
  }
>()('@bible/film/rive/RiveRuntime') {}
