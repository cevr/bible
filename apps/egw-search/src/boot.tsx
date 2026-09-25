/**
 * The browser boot, shared by the two entries. This file is the browser
 * boundary: `document` and `location` live here only. It provides the actor
 * transport the query reads through, the query cache, and the document's own
 * location, and hydrates the routes over the document the server streamed.
 *
 * `index.tsx` boots with nothing extra. `index.dev.tsx` boots with the live
 * inspection attachment, so the production bundle carries none of it.
 */

import { HttpTransport, QueryCache } from 'effect-frame/actor/client';
import * as Frame from 'effect-frame/frame';
import {
  Location,
  NavigationBehavior,
  browserNavigation,
  followLinks,
  hydrate,
} from 'effect-frame/router';
import { Dom } from 'effect-frame/view';
import { Effect, Layer } from 'effect';
import type { Scope } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';

import { actorPrefix } from './contract.js';
import { rootId } from './document.js';
import { NotFound, routes } from './routes.js';

/** Work that runs beside the mounted page, in the page's scope, with the
 *  page's Frame. */
export type Beside = Effect.Effect<void, never, Frame.Service | Scope.Scope>;

const start = (beside: Beside) =>
  Effect.gen(function* () {
    // The server's document wrote this element; a page without it is not
    // this app's page.
    const root = yield* Effect.orDie(Dom.root(rootId));
    // One call reads the records the server streamed into the document,
    // seeds the cache (a pane that declares a settled key never fetches it),
    // adopts the server's nodes, and drops the seeds no pane took. A
    // document with an empty root (the server's time-limit fallback) has
    // nothing to adopt, and the page draws fresh.
    // `Restore` for the router, which this app's one leaf overrides with
    // `Preserve` (`./routes.tsx`); the not-found page lands like a new page.
    // Back and Forward wait up to three seconds for a page's declared reads.
    const { router, report } = yield* hydrate({
      routes,
      notFound: NotFound,
      root,
      landing: NavigationBehavior.Restore,
      traversalReadLimit: '3 seconds',
    });
    if (report.mismatches.length > 0) {
      yield* Effect.logWarning(
        `[hydrate] mismatch count=${String(report.mismatches.length)} first=${report.mismatches[0] ?? ''}`,
      );
    }
    yield* followLinks(root, router);
    yield* beside;
    // The page lives as long as the tab does.
    return yield* Effect.never;
  });

const services = Layer.mergeAll(
  HttpTransport.layer({
    baseUrl: `${location.origin}${actorPrefix}`,
    reconnect: HttpTransport.defaultReconnect,
  }).pipe(Layer.provide(FetchHttpClient.layer)),
  QueryCache.layer.pipe(Layer.provideMerge(Frame.layer({ name: 'egw-search' }))),
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
