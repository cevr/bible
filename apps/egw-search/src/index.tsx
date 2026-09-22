/**
 * The browser entry. This file is the browser boundary: `document` and
 * `location` live here only. It provides the actor transport the query
 * reads through, the query cache, and the document's own location, and
 * mounts the one route.
 */

import { HttpTransport, queryCacheLayer } from 'effect-frame/actor/client';
import type { Source } from 'effect-frame/actor/client';
import {
  Link,
  Location,
  Route,
  browserLocation,
  followLinks,
  link,
  mount,
} from 'effect-frame/router';
import { Dom, View } from 'effect-frame/view';
import { Effect, Layer, Option, Schema } from 'effect';

import { SearchPage } from './app.js';
import { actorPrefix } from './contract.js';

const EmptySearch = Route.search(Schema.Struct({}));

const search = Route.client('search', {
  path: '/',
  params: Schema.Struct({}),
  search: EmptySearch,
  view: SearchPage,
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

const start = Effect.gen(function* () {
  const found = yield* Effect.sync(() => Option.fromNullishOr(document.getElementById('root')));
  if (Option.isNone(found)) {
    return yield* Effect.die('egw-search: no #root element to mount on');
  }
  const root = found.value;
  const router = yield* mount({ routes: [search], notFound: NotFound, host: Dom.host, root });
  yield* followLinks(root, router);
  // The page lives as long as the tab does.
  return yield* Effect.never;
});

const services = Layer.mergeAll(
  HttpTransport.layer({
    baseUrl: `${location.origin}${actorPrefix}`,
    reconnect: HttpTransport.defaultReconnect,
  }),
  queryCacheLayer,
  Layer.succeed(Location, browserLocation),
);

// The browser entry point: the one place the client services are provided.
Effect.runFork(Effect.scoped(Effect.provide(start, services)));
