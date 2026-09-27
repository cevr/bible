// The film's page, served on the loopback interface while a render runs: the
// page (Bun bundles it and the Rive runtime it imports), the runtime's wasm,
// and the .riv the build wrote. The server stops with the scope that started it.

import { Context, Effect, Layer, Path, type Scope } from 'effect';
import page from '../page/index.html';
import { ServeFailed } from './errors.ts';

export interface PageServerService {
  /** Serve the page drawing `riv`; returns the page's URL. */
  readonly serve: (riv: string) => Effect.Effect<string, ServeFailed, Scope.Scope>;
}

export class PageServer extends Context.Service<PageServer, PageServerService>()(
  '@bible/film/tools/PageServer',
) {
  static readonly layer = Layer.effect(
    PageServer,
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const wasm = yield* path
        .fromFileUrl(new URL(import.meta.resolve('@rive-app/canvas-advanced/rive.wasm')))
        .pipe(Effect.mapError((error) => ServeFailed.make({ reason: error.message })));

      const serve = Effect.fn('PageServer.serve')(function* (riv: string) {
        const server = yield* Effect.acquireRelease(
          Effect.try({
            try: () =>
              Bun.serve({
                hostname: '127.0.0.1',
                port: 0,
                development: false,
                routes: {
                  '/': page,
                  '/rive.wasm': () =>
                    new Response(Bun.file(wasm), {
                      headers: { 'content-type': 'application/wasm' },
                    }),
                  '/film.riv': () => new Response(Bun.file(riv)),
                },
                fetch: () => new Response('not found', { status: 404 }),
              }),
            catch: (cause) => ServeFailed.make({ reason: String(cause) }),
          }),
          (s) => Effect.promise(() => s.stop(true)),
        );
        return `http://127.0.0.1:${server.port}/`;
      });

      return PageServer.of({ serve });
    }),
  );
}
