// What a test reads of an HTTP API's declaration: its routes, and whether it
// declares the one a request reaches; and a library as a film's mix reads it,
// every derived sound measured. Tests only; the server derives its handlers
// from the API itself (`core/api.ts`), and the film loader measures over the
// shared renderer (tools/sound-render.ts).

import { Option, Result } from 'effect';
import { HttpApi, type HttpApiGroup } from 'effect/http-api';
import {
  type Library,
  type Lock,
  type Sounds,
  isDerived,
  measurePcm,
  renderSource,
  seedSources,
  soundEntry,
  sourceLabel,
} from './sfx.ts';
import { resolveCode } from './synth/resolve.ts';

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

/**
 * `library` and its `lock` as a film's mix reads them: its code sounds
 * resolved and every seed of every derived sound measured, as the film loader
 * measures the sounds a film places.
 */
export const measuredSounds = (library: Library, lock: Lock, dir: string): Sounds => {
  const { code, trials } = Result.getOrThrow(resolveCode(library));
  const bare: Sounds = { library, lock, dir, code, trials, measured: new Map() };
  const sources = Object.keys(library).flatMap((name) =>
    Option.match(Option.filter(soundEntry(library, name), isDerived), {
      onNone: () => [],
      onSome: (entry) => seedSources(bare, name, entry),
    }),
  );
  return {
    ...bare,
    measured: new Map(
      sources.map((source) => [sourceLabel(source), measurePcm(renderSource(source))]),
    ),
  };
};
