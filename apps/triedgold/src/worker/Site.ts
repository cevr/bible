/**
 * triedgold.com on Cloudflare: one Worker with the client build as its static
 * assets.
 *
 * Requests are served assets-first: a path that names a file in the client
 * build (a hashed asset, the favicon) never invokes the Worker, and
 * `public/_headers` sets its caching. Everything else reaches `fetch`, which
 * hands it to React Router (`../server/render.ts`): the pages, and the 404
 * page for a path no route matches.
 *
 * `prod` takes the Worker name `triedgold`, the `triedgold.com` custom domain
 * with `www.triedgold.com` redirecting to it, and turns its `workers.dev` host
 * off. Any other stage is a throwaway copy on a generated `workers.dev` name
 * and never touches the domain.
 */
import * as Cloudflare from 'alchemy/Cloudflare';
import { Stage } from 'alchemy/Stage';
import { Effect, Option } from 'effect';
import { HttpServerRequest } from 'effect/http';
import { createRequestHandler } from 'react-router';

import * as build from '#server-build';

import { respond } from '../server/render.ts';

/** The public hostname. Its zone is on Cloudflare. */
const DOMAIN = 'triedgold.com';

const ASSETS = {
  directory: 'build/client',
  htmlHandling: 'drop-trailing-slash',
  notFoundHandling: 'none',
} as const;

/**
 * The props, by stage. They are read at deploy time, where the stage is
 * known; the running Worker reads them too, without one, and needs only the
 * base.
 */
const props = Effect.gen(function* () {
  const stage = yield* Effect.serviceOption(Stage);
  const base = { main: import.meta.url, assets: ASSETS };
  if (!Option.contains(stage, 'prod')) return base;
  return {
    ...base,
    name: 'triedgold',
    workersDev: false,
    domain: { name: DOMAIN, redirects: [`www.${DOMAIN}`] },
  };
});

export default class Site extends Cloudflare.Worker<Site>()(
  'Site',
  props,
  Effect.sync(() => {
    const handle = createRequestHandler(build, 'production');
    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        return yield* respond(handle, request);
      }),
    };
  }),
) {}
