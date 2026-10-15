/**
 * A request the static files do not answer, rendered by React Router.
 *
 * Cloudflare's asset layer answers the prerendered pages, the hashed assets
 * and the public files before the Worker runs (`public/_headers` sets their
 * caching). The Worker sees the rest: any unknown path, which React Router
 * answers with the not-found page and a 404.
 */
import { Effect } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';

/** React Router's request handler, as `createRequestHandler` returns it. */
export type Handle = (request: Request) => Promise<Response>;

const render = Effect.fn('Site.render')(function* (
  handle: Handle,
  request: HttpServerRequest.HttpServerRequest,
) {
  const web = yield* HttpServerRequest.toWeb(request);
  // React Router answers every request it is handed, errors included, so a
  // rejected promise is a defect, not an expected failure.
  const response = yield* Effect.promise(() => handle(web));
  return HttpServerResponse.fromWeb(response);
});

/** `render`, with a request the host cannot hand to React Router answered 400. */
export const respond = (handle: Handle, request: HttpServerRequest.HttpServerRequest) =>
  render(handle, request).pipe(
    // Only the request body can fail the conversion to a Web request.
    Effect.catchTag(['RequestParseError', 'RouteNotFound', 'InternalError'], () =>
      Effect.succeed(HttpServerResponse.empty({ status: 400 })),
    ),
  );
