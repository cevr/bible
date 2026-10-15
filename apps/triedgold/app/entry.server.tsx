// Server rendering on the Worker: React's Web Streams renderer, since the
// Worker has no Node streams. Crawlers get the whole document at once.
import { Effect } from 'effect';
import { isbot } from 'isbot';
import { renderToReadableStream } from 'react-dom/server';
import type { EntryContext } from 'react-router';
import { ServerRouter } from 'react-router';

/** How long React Router waits for deferred data before it gives up. */
export const streamTimeout = 5_000;

const document = Effect.fn('Site.document')(function* (
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  let statusCode = responseStatusCode;
  // React reports render errors through a callback; they are logged on this
  // fiber's services.
  const log = Effect.runForkWith(yield* Effect.context());
  // The shell is awaited here; the rest streams after the response returns,
  // so the render is cut off by a timer, not by this fiber.
  const signal = AbortSignal.timeout(streamTimeout + 1_000);
  // A shell that cannot render rejects: React Router renders its error page.
  const body = yield* Effect.promise(() =>
    renderToReadableStream(<ServerRouter context={routerContext} url={request.url} />, {
      signal,
      onError(error) {
        statusCode = 500;
        log(Effect.logError('React could not render', error));
      },
    }),
  );
  if (isbot(request.headers.get('user-agent') ?? '') || routerContext.isSpaMode) {
    yield* Effect.promise(() => body.allReady);
  }
  responseHeaders.set('Content-Type', 'text/html');
  return new Response(body, { headers: responseHeaders, status: statusCode });
});

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  return Effect.runPromise(document(request, responseStatusCode, responseHeaders, routerContext));
}
