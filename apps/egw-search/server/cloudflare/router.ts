/**
 * The Worker's router: the JSON API and the sync's report pages over the
 * search's services.
 *
 * Its own module, apart from `./Search.ts`, so a test can build it the way
 * the Worker does: on the first request, inside that request's fiber.
 */
import { Context, Effect, FileSystem, Layer, Path, Scope } from 'effect';
import type { SqlClient } from 'effect/sql';
import { Etag, HttpPlatform, HttpRouter } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';

import type { SearchService } from '@bible/core/search';

import { SearchApi } from '../api.js';
import { SearchGroupLive } from '../search-api.js';
import type { VectorIndexLoad } from '../vector-index.js';
import { type ReportStore, syncRoutes } from './sync-pages.ts';

/** What the router's handlers read. */
export type SearchServices = SearchService | SqlClient.SqlClient | VectorIndexLoad;

/**
 * `build` with none of its caller's services in reach.
 *
 * A build that runs inside a request must keep nothing of that request. An
 * `HttpApiBuilder` group keeps the context it was built in and provides it
 * over every request it answers, and the kept context wins over the
 * request's own. A group built with the first request's `HttpServerRequest`
 * in reach would answer every later POST with that request's body.
 */
export const isolated = <A, E>(build: Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.updateContext(build, () => Context.empty());

/** The router over `services`, its layers held open by `scope`. Built
 *  isolated, so it can be built inside the request that first needs it:
 *  of its caller's services it keeps the platform's file system and paths
 *  alone. */
export const searchRouter = (
  services: Context.Context<SearchServices>,
  store: ReportStore,
  scope: Scope.Scope,
) => {
  const api = HttpApiBuilder.layer(SearchApi).pipe(
    Layer.provide(SearchGroupLive.pipe(Layer.provide(Layer.succeedContext(services)))),
    Layer.provide(Layer.mergeAll(Etag.layer, HttpPlatform.layer)),
  );
  const build = HttpRouter.toHttpEffect(Layer.mergeAll(api, syncRoutes(store))).pipe(
    Scope.provide(scope),
  );
  return Effect.contextWith((context: Context.Context<FileSystem.FileSystem | Path.Path>) =>
    isolated(
      build.pipe(Effect.provideContext(Context.pick(FileSystem.FileSystem, Path.Path)(context))),
    ),
  );
};
