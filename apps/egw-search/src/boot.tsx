/**
 * The browser boot, shared by the two entries. This file is the browser
 * boundary: `document` and `location` live here only. It provides the actor
 * transport the query reads through, the query cache, and the document's own
 * location, and hydrates the routes over the document the server streamed.
 *
 * `index.tsx` boots with nothing extra. `index.dev.tsx` boots with the live
 * inspection attachment, so the production bundle carries none of it.
 */

import { HttpTransport, Streaming, queryCacheLayer } from 'effect-frame/actor/client';
import * as Frame from 'effect-frame/frame';
import { Location, browserNavigation, followLinks, mount } from 'effect-frame/router';
import { Dom, render } from 'effect-frame/view';
import { Effect, Layer, Option } from 'effect';
import type { Scope } from 'effect';

import { actorPrefix } from './contract.js';
import { NotFound, routes } from './routes.js';

/** Work that runs beside the mounted page, in the page's scope, with the
 *  page's Frame. */
export type Beside = Effect.Effect<void, never, Frame.Service | Scope.Scope>;

const start = (beside: Beside) =>
  Effect.gen(function* () {
    const found = yield* Effect.sync(() => Option.fromNullishOr(document.getElementById('root')));
    if (Option.isNone(found)) {
      return yield* Effect.die('egw-search: no #root element to mount on');
    }
    const root = found.value;
    // The server streamed the shell and each query's value into the
    // document. Seed the cache before mounting, so a pane that declares a
    // settled key reads it from the document and never fetches it.
    const resumed = yield* Streaming.resume(yield* Dom.readRecords);
    // Adopt the server's nodes. A document with an empty root (the server's
    // time-limit fallback) has nothing to adopt, and the page draws fresh.
    const hydration = Dom.hydrate(root);
    const router = yield* mount({ routes, notFound: NotFound, host: hydration.host, root });
    yield* render;
    const report = yield* hydration.finish;
    if (report.mismatches.length > 0) {
      yield* Effect.logWarning(
        `[hydrate] mismatch count=${String(report.mismatches.length)} first=${report.mismatches[0] ?? ''}`,
      );
    }
    // Seeds no pane took are dropped: a pane opened later reads its own.
    yield* resumed.hydrated;
    yield* followLinks(root, router);
    yield* beside;
    // The page lives as long as the tab does.
    return yield* Effect.never;
  });

const services = Layer.mergeAll(
  HttpTransport.layer({
    baseUrl: `${location.origin}${actorPrefix}`,
    reconnect: HttpTransport.defaultReconnect,
  }),
  queryCacheLayer.pipe(Layer.provideMerge(Frame.layer({ name: 'egw-search' }))),
  // The Navigation API Location. The search route is `Preserve`: a new search
  // keeps the page where it is, and Back or Forward returns to the entry's
  // saved position once the router has drawn it. A browser without the
  // Navigation API gets the History API Location.
  Layer.effect(Location, browserNavigation),
);

/** Run the page: the one place the client services are provided. */
export const boot = (beside: Beside): void => {
  Effect.runFork(Effect.scoped(Effect.provide(start(beside), services)));
};
