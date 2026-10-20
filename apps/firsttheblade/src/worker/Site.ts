/**
 * The site on Cloudflare: one Worker that serves `dist/` from its static
 * assets, with every request passing through the policy in `./respond.ts`
 * first (`runWorkerFirst`), so its headers and its 404 hold for every file.
 *
 * Where it is served from follows the stage and `SERVED_FROM`
 * (`../site.ts`): `prod` takes the Worker name `firsttheblade` (so its
 * `workers.dev` host is `firsttheblade.<subdomain>.workers.dev`), and with
 * `SERVED_FROM = 'custom-domain'` it takes the apex domain, redirects `www`
 * and each of `REDIRECTED_DOMAINS` (with its `www`) to it, and turns its
 * `workers.dev` host off. Any other stage is a throwaway copy on a
 * generated `workers.dev` name and never touches the domain.
 */
import { Stage } from 'alchemy/Stage';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect, Option } from 'effect';
import { HttpServerRequest } from 'effect/http';

import { DOMAIN, REDIRECTED_DOMAINS, SERVED_FROM, type ServedFrom, WORKER_NAME } from '../site.ts';
import { Assets } from './assets.ts';
import { respond } from './respond.ts';

const ASSETS = {
  directory: 'dist',
  runWorkerFirst: true,
  htmlHandling: 'auto-trailing-slash',
  notFoundHandling: 'none',
} as const;

/** What `prod` claims, by where the site is served from. */
const PRODUCTION: Record<ServedFrom, Cloudflare.WorkerProps> = {
  'workers.dev': { name: WORKER_NAME, workersDev: true },
  'custom-domain': {
    name: WORKER_NAME,
    workersDev: false,
    domain: {
      name: DOMAIN,
      redirects: [`www.${DOMAIN}`, ...REDIRECTED_DOMAINS.flatMap((name) => [name, `www.${name}`])],
    },
  },
};

/**
 * The props, by stage. They are read at deploy time, where the stage is
 * known; the running Worker reads them too, without one, and needs only
 * the base.
 */
const props = Effect.gen(function* () {
  const stage = yield* Effect.serviceOption(Stage);
  const base = { main: import.meta.url, assets: ASSETS };
  if (!Option.contains(stage, 'prod')) return base;
  return { ...base, ...PRODUCTION[SERVED_FROM] };
});

export default class Site extends Cloudflare.Worker<Site>()(
  'Site',
  props,
  Effect.gen(function* () {
    const env = yield* Cloudflare.WorkerEnvironment;
    // The binding is read per request: the environment fills in when the
    // Worker runs, not when this module is bundled.
    const assets = Assets.of({
      serve: (request) =>
        Cloudflare.fromCloudflareFetcher(env['ASSETS']).fetch(request).pipe(Effect.orDie),
    });
    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        return yield* respond(request).pipe(Effect.provideService(Assets, assets));
      }),
    };
  }),
) {}
