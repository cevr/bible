// What a test reads of an HTTP API's declaration: its routes, and whether it
// declares the one a request reaches. Tests only; the server derives its
// handlers from the API itself (`core/api.ts`).

import { HttpApi, type HttpApiGroup } from 'effect/http-api';

/** A route an API declares: its method and its path, `:param`s and a trailing `*` as declared. */
export interface Route {
  readonly method: string;
  readonly path: string;
}

/** Every route `api` declares, group by group. */
export const routesOf = <Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
): ReadonlyArray<Route> => {
  const routes: Array<Route> = [];
  HttpApi.reflect(api, {
    onGroup: () => {},
    onEndpoint: ({ endpoint }) =>
      void routes.push({ method: endpoint.method, path: endpoint.path }),
  });
  return routes;
};

/** A declared route's path as a matcher: a `:param` is one segment, a trailing `*` the rest. */
const matcherOf = (path: string): RegExp =>
  new RegExp(`^${path.replace(/:\w+/g, '[^/]+').replace(/\*$/, '.*')}$`);

/**
 * Whether `api` declares a route that `method pathname` reaches: what a fake
 * server checks before it answers, so a test never vouches for a path the
 * real server does not serve.
 */
export const declares = <Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
): ((method: string, pathname: string) => boolean) => {
  const routes = routesOf(api).map((route) => ({
    method: route.method,
    path: matcherOf(route.path),
  }));
  return (method, pathname) =>
    routes.some((route) => route.method === method && route.path.test(pathname));
};
