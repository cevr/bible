/**
 * The site as a Railway service: Effect-native, no Dockerfile.
 *
 * `main: import.meta.url` makes this file the bundle entry. Alchemy bundles it
 * with Rolldown, which inlines the React Router server build through the
 * `#server-build` import, and runs it on `node:26-slim` as `/app/index.mjs`.
 * The client build is copied beside it (`/app/build/client`) with
 * `extraFiles`, whose contents are hashed, so a CSS or asset change redeploys.
 *
 * The routes are `src/server/site.ts`, the same layer `server.ts` and the tests
 * serve. Only the host differs: Railway's Node server here, Bun there.
 */
import { NodeHttpPlatform, NodeServices } from '@effect/platform-node';
import * as Alchemy from 'alchemy';
import { Service } from 'alchemy/Railway/Service';
import { Effect, Layer, Path } from 'effect';
import { HttpRouter } from 'effect/http';

import * as build from '#server-build';

import { PORT, TriedGold, serviceName } from '../../infra/railway.ts';
import * as Site from '../server/site.ts';

/** The client build, relative to the image root (`/app`). */
const CLIENT = 'build/client';

export default class Server extends Service<Server>()(
  'Server',
  Alchemy.Stack.useSync((stack) => ({
    project: TriedGold,
    ...serviceName(stack.stage),
    main: import.meta.url,
    port: PORT,
    // `triedgold.com` serves prod. Throwaway stages need the generated URL.
    publicDomain: stack.stage !== 'prod',
    healthcheck: '/health',
    restartPolicyType: 'ON_FAILURE' as const,
    restartPolicyMaxRetries: 10,
    // React's CommonJS builds pick production mode from this at runtime.
    env: { NODE_ENV: 'production' },
    // Relative to where `alchemy` runs: the package scripts run it here.
    extraFiles: [{ source: CLIENT, dest: CLIENT }],
  })),
  Effect.gen(function* () {
    const path = yield* Path.Path;
    // The bundle is `/app/index.mjs`, so its directory is the image root. A
    // module URL that is not a file URL is a broken bundle: a defect.
    const here = path.dirname(yield* Effect.orDie(path.fromFileUrl(new URL(import.meta.url))));
    // `HttpStaticServer.make` declares a PlatformError but touches no file
    // until a request, so building the routes cannot fail here.
    const handler = yield* Effect.orDie(
      HttpRouter.toHttpEffect(Site.layer(build, path.join(here, CLIENT))),
    );
    return { fetch: handler };
  }).pipe(Effect.provide(Layer.merge(NodeServices.layer, NodeHttpPlatform.layer))),
) {}
