/**
 * The site: the built client files, and the page document for every other
 * path.
 *
 * The server renders the page's document from the same route tree the
 * browser mounts (`../src/routes.tsx`). The search route is `Streamed`: the
 * shell goes out at once, then one record per pane query as it settles, and
 * the browser hydrates the shell and reads each value from the document.
 *
 * One `GET /*` route owns both halves, and a path decides which: a path whose
 * last segment has an extension (`/index.js`, `/styles.css`) is a file from
 * the build; any other path (`/`, `/?q=…`, a deep link) is a document. This is
 * the rule the static server's SPA fallback used, without the fallback file.
 */

import { ActorTransport } from 'effect-frame/actor/client';
import { renderDocument } from 'effect-frame/router';
import type { DocumentTimedOut } from 'effect-frame/router';
import type { Html } from 'effect-frame/view';
import { Effect, Option, Stream } from 'effect';
import type { Scope } from 'effect';
import {
  HttpEffect,
  HttpRouter,
  HttpServerRequest,
  HttpServerRespondable,
  HttpServerResponse,
  HttpStaticServer,
} from 'effect/unstable/http';

import { NotFound, routes } from '../src/routes.js';

/** The page around the routed markup. The module script sits in the head: a
 *  module runs only after the document ends, and the head lets the browser
 *  fetch it while the server is still streaming the results. */
const page: Html.Document = {
  head: [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<title>EGW Search</title>',
    '<meta name="description" content="Hybrid search over the Ellen G. White corpus, linking out to egwwritings.org." />',
    '<link rel="stylesheet" href="/styles.css" />',
    '<script type="module" src="/index.js"></script>',
    '</head>',
    '<body>',
    '<div id="root">',
  ].join(''),
  tail: '</div>',
  bootstrap: '',
  end: '</body></html>',
};

/** The same page with nothing drawn: the browser mounts into the empty root. */
const clientOnly = `${page.head}${page.tail}${page.end}`;

/** How long a document may wait for its queries.
 *
 *  The shell must be drawn inside it, or the answer is the client-only page.
 *  After the shell, a query still open at the limit is closed in the
 *  document, and the browser reads it itself over `POST /query`. A warm
 *  search answers in about a second; a cold one, right after a deploy, can
 *  take far longer, and the reader should see the page before that. */
const DOCUMENT_LIMIT = '10 seconds';

const HTML = 'text/html; charset=utf-8';

/** A file from the build has an extension in its last segment. */
const isFilePath = (pathname: string): boolean => {
  const last = pathname.slice(pathname.lastIndexOf('/') + 1);
  return last.includes('.');
};

/** Render one request's document, in the request's Scope. A `Streamed` body
 *  goes on writing after the handler returns, so the response takes the
 *  request Scope with it and closes it when the body ends. */
const renderPage = (url: URL) =>
  renderDocument({
    routes,
    notFound: NotFound,
    url,
    document: page,
    closeWhen: Effect.sleep(DOCUMENT_LIMIT),
  }).pipe(
    Effect.map((outcome) => {
      if (outcome._tag === 'Redirect') {
        return HttpServerResponse.redirect(outcome.location, { status: 303 });
      }
      return HttpEffect.scopeTransferToStream(
        HttpServerResponse.stream(Stream.encodeText(outcome.body), {
          status: outcome.status,
          contentType: HTML,
        }),
      );
    }),
    Effect.catchTag('DocumentTimedOut', (error: DocumentTimedOut) =>
      Effect.as(
        Effect.logWarning(`[document] timed out phase=${error.phase} path=${url.pathname}`),
        HttpServerResponse.text(clientOnly, { contentType: HTML }),
      ),
    ),
  );

type Handler = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  never,
  HttpServerRequest.HttpServerRequest | Scope.Scope
>;

export const SiteLive = (options: { readonly staticRoot: string }) =>
  HttpRouter.use((router) =>
    Effect.gen(function* () {
      const files = (yield* HttpStaticServer.make({ root: options.staticRoot })).pipe(
        Effect.catch(HttpServerRespondable.toResponse),
      );
      // Resolved once, when the route is built, so a request carries no
      // requirement of its own out through the router. The transport alone,
      // not the build's whole context: the render must run in the request's
      // Scope, which the streamed response takes and closes.
      const transport = yield* ActorTransport;
      const handle = (request: HttpServerRequest.HttpServerRequest): Handler =>
        Option.match(HttpServerRequest.toURL(request), {
          onNone: () => Effect.succeed(HttpServerResponse.empty({ status: 400 })),
          onSome: (url): Handler => {
            if (isFilePath(url.pathname)) {
              return files;
            }
            return renderPage(url).pipe(Effect.provideService(ActorTransport, transport));
          },
        });
      yield* router.add('GET', '/*', handle);
    }),
  );
