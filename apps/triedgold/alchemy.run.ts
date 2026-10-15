/**
 * Tried Gold, declared as an Alchemy stack: one Cloudflare Worker serving the
 * React Router build (`src/worker/Site.ts`).
 *
 * - `prod` is the Worker `triedgold` on `triedgold.com`, with
 *   `www.triedgold.com` redirecting to the apex. Deploying it is the owner's
 *   call (`bun run deploy`).
 * - Every other stage (`test_$USER`, `agent-*`) is a throwaway copy on a
 *   generated `workers.dev` URL with no domain, created with
 *   `bunx alchemy deploy alchemy.run.ts --stage <name>` and destroyed with
 *   `bunx alchemy destroy alchemy.run.ts --stage <name>`.
 *
 * Run it from this directory after `react-router build` (the package scripts
 * do both): the Worker serves `build/client` as its assets and bundles
 * `build/server`. State lives in the Cloudflare state store, so every machine
 * and CI see the same resources.
 */
import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect } from 'effect';

import Site from './src/worker/Site.ts';

/** The stack's providers, shared with the deploy test's harness. */
export const providers = Cloudflare.providers();

export default Alchemy.Stack(
  'triedgold',
  { providers, state: Cloudflare.state() },
  Effect.gen(function* () {
    const site = yield* Site;
    return { url: site.url };
  }),
);
