// Rive in a page (`RiveRuntimeBrowser`): each engine's package loaded with the
// first rig that engine draws, its wasm from the package's asset URL (the
// page's build serves it), and a rig's `.riv` through the page's `HttpClient`.
// A page that draws a rig with the Rive Renderer and has no WebGL 2 fails its
// load, naming why, rather than draw nothing.

import canvasWasm from '@rive-app/canvas-advanced/rive.wasm' with { type: 'file' };
import glWasm from '@rive-app/webgl2-advanced/rive.wasm' with { type: 'file' };
import type { RiveCanvas } from '@rive-app/webgl2-advanced';
import { Effect, Layer, Option } from 'effect';
import { HttpClient } from 'effect/http';
import type { RiveEngine } from '../canvas/rive.ts';
import { RigUnloadable } from '../core/errors.ts';
import { onceScoped } from '../core/once.ts';
import { RiveRuntime } from './runtime.ts';

/** Each engine's module, loaded with the first rig it draws. */
const loadCanvas = () => import('@rive-app/canvas-advanced');
const loadGl = () => import('@rive-app/webgl2-advanced');

/** Why `engine`'s runtime would not start. */
const unstarted = (engine: RiveEngine) => (cause: unknown) =>
  RigUnloadable.make({ rig: `the ${engine} runtime`, reason: String(cause) });

/** Whether this page can make a WebGL 2 context, which the Rive Renderer draws with. */
const hasWebGl2 = Effect.sync(() =>
  Option.isSome(Option.fromNullishOr(document.createElement('canvas').getContext('webgl2'))),
);

/** Each engine's runtime, started. */
const ENGINES = {
  canvas: Effect.flatMap(
    Effect.tryPromise({ try: loadCanvas, catch: unstarted('canvas') }),
    (module) =>
      Effect.tryPromise({
        try: () => module.default({ locateFile: () => canvasWasm }),
        catch: unstarted('canvas'),
      }),
  ),
  webgl2: Effect.flatMap(
    Effect.filterOrFail(
      hasWebGl2,
      (has) => has,
      () =>
        unstarted('webgl2')(
          'this browser has no WebGL 2, so the Rive Renderer cannot draw (Chrome with --disable-gpu and no SwiftShader)',
        ),
    ),
    () =>
      Effect.flatMap(Effect.tryPromise({ try: loadGl, catch: unstarted('webgl2') }), (module) =>
        Effect.tryPromise({
          try: () => module.default({ locateFile: () => glWasm }),
          catch: unstarted('webgl2'),
        }),
      ),
  ),
} satisfies Record<RiveEngine, Effect.Effect<RiveCanvas, RigUnloadable>>;

export const RiveRuntimeBrowser = Layer.effect(
  RiveRuntime,
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;
    const canvas = yield* onceScoped(ENGINES.canvas);
    const webgl2 = yield* onceScoped(ENGINES.webgl2);
    const runtimes = { canvas, webgl2 } satisfies Record<
      RiveEngine,
      Effect.Effect<RiveCanvas, RigUnloadable>
    >;
    const read = (riv: string) => {
      const unreadable = (reason: string) => RigUnloadable.make({ rig: riv, reason });
      return http.get(riv).pipe(
        Effect.mapError((error) => unreadable(error.message)),
        Effect.filterOrFail(
          (res) => res.status >= 200 && res.status < 300,
          (res) => unreadable(`status ${res.status}`),
        ),
        Effect.flatMap((res) =>
          Effect.mapError(res.arrayBuffer, (error) => unreadable(error.message)),
        ),
        Effect.map((bytes) => new Uint8Array(bytes)),
      );
    };
    return RiveRuntime.of({ runtime: (engine) => runtimes[engine], read, paints: true });
  }),
);
