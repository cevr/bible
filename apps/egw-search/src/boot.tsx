/**
 * The browser boot, shared by the two entries. This file is the browser
 * boundary: `document` and `location` live here only. It provides the actor
 * transport the query reads through, the query cache, and the document's own
 * location, and mounts the one route.
 *
 * `index.tsx` boots with nothing extra. `index.dev.tsx` boots with the live
 * inspection attachment, so the production bundle carries none of it.
 */

import { HttpTransport, queryCacheLayer } from 'effect-frame/actor/client';
import type { Source } from 'effect-frame/actor/client';
import * as Frame from 'effect-frame/frame';
import {
  Link,
  Location,
  NavigationBehavior,
  Route,
  browserLocation,
  followLinks,
  link,
  mount,
} from 'effect-frame/router';
import { Dom, View } from 'effect-frame/view';
import { Effect, Layer, Option, Schema } from 'effect';
import type { Scope } from 'effect';

import { SearchPage } from './app.js';
import { actorPrefix } from './contract.js';

const EmptySearch = Route.search(Schema.Struct({}));

/**
 * **Preserve.** Every move on this route is workspace state on the leaf the
 * reader is already on: a search pushes, a filter replaces, a pane opens or
 * closes. None of them is a new page, so none may scroll the page to the top
 * or take focus to the page root. A new pane's search box places itself
 * (its `Dom.scrollIntoView` and `Dom.focus` in `./app.tsx`); the router has
 * no landing for a node that appears inside a stayed leaf.
 */
const search = Route.client('search', {
  path: '/',
  params: Schema.Struct({}),
  search: EmptySearch,
  view: SearchPage,
  behavior: NavigationBehavior.Preserve,
});

/** The server sends every unknown path to this page, so the router is what
 *  says a path is nothing. */
const NotFound = (props: { readonly url: Source<URL> }) =>
  Effect.gen(function* () {
    // A typed link: the href is printed through the route's own Schemas.
    const home = yield* link(search, {}, {});
    return (
      <div class="shell">
        <header class="masthead">
          <h1>EGW&nbsp;Search</h1>
        </header>
        <div class="status">
          <span>
            nothing at {View.bind(props.url, (url) => url.pathname)} —{' '}
            <Link link={home}>search</Link>
          </span>
        </div>
      </div>
    );
  });

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
    const router = yield* mount({ routes: [search], notFound: NotFound, host: Dom.host, root });
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
  // The History API Location, not `browserNavigation`. The search route is
  // `Preserve`, and under the Navigation API a `Preserve` traversal is
  // intercepted with manual scroll and never placed, so Back would lose the
  // browser's saved position. Here the browser restores it on `popstate`.
  // This app has no leave checks, the other thing `browserNavigation` adds.
  Layer.succeed(Location, browserLocation),
);

/** Run the page: the one place the client services are provided. */
export const boot = (beside: Beside): void => {
  Effect.runFork(Effect.scoped(Effect.provide(start(beside), services)));
};
