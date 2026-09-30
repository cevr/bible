/**
 * The site's HTTP surface, the same on every host: the local Bun server
 * (`server.ts`), the Railway service (`src/deploy/Server.ts`) and the tests
 * mount this one layer.
 *
 * - `GET /health` answers `ok` (Railway's health check).
 * - A GET or HEAD for a file in the client build serves it: the hashed files
 *   under `/assets/` cached for a year, the rest (the favicon, the public
 *   folder) for an hour. A separate `GET /assets/*` route lost to the
 *   `*` catch-all (assets came back with the hour policy), so the one
 *   handler picks the policy by path.
 * - Everything else is a page: React Router renders it, 404s included.
 */
import { Effect, Layer } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse, HttpStaticServer } from 'effect/http';
import { createRequestHandler, type ServerBuild } from 'react-router';

const YEAR = 'public, max-age=31536000, immutable';
const HOUR = 'public, max-age=3600';

/** The routes for one React Router build, its client files under `clientDir`. */
export const layer = (build: ServerBuild, clientDir: string) =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      const router = yield* HttpRouter.HttpRouter;
      const handle = createRequestHandler(build, 'production');
      const assets = yield* HttpStaticServer.make({ root: clientDir, cacheControl: YEAR });
      // No index: a directory is a page, and React Router owns every page.
      // `index: undefined` is how HttpStaticServer turns its index off.
      const files = yield* HttpStaticServer.make({
        root: clientDir,
        // oxlint-disable-next-line effect/noNullish -- HttpStaticServer's off switch
        index: undefined,
        cacheControl: HOUR,
      });

      const staticFor = (url: string) => {
        if (url.startsWith('/assets/')) return assets;
        return files;
      };

      // React Router answers every request it is handed, errors included, so
      // a rejected promise here is a defect, not an expected failure.
      const render = Effect.fn('Site.render')(function* (
        request: HttpServerRequest.HttpServerRequest,
      ) {
        const web = yield* HttpServerRequest.toWeb(request);
        const response = yield* Effect.promise(() => handle(web));
        return HttpServerResponse.fromWeb(response);
      });

      const page = Effect.fn('Site.page')(function* (request: HttpServerRequest.HttpServerRequest) {
        return yield* render(request).pipe(
          // Only the request body can fail the conversion to a Web request.
          Effect.catchTag(['RequestParseError', 'RouteNotFound', 'InternalError'], () =>
            Effect.succeed(HttpServerResponse.empty({ status: 400 })),
          ),
        );
      });

      const fileOrPage = Effect.fn('Site.fileOrPage')(function* (
        request: HttpServerRequest.HttpServerRequest,
      ) {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          return yield* page(request);
        }
        return yield* staticFor(request.url).pipe(
          Effect.catchReason('HttpServerError', 'RouteNotFound', () => page(request)),
        );
      });

      yield* router.add('GET', '/health', HttpServerResponse.text('ok'));
      yield* router.add('*', '*', fileOrPage);
    }),
  );
