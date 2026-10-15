/**
 * EGW Search on Cloudflare, declared as an Alchemy stack: one Worker
 * (`server/cloudflare/Search.ts`) over the corpus in D1 and the vectors in
 * Vectorize (`server/cloudflare/resources.ts`).
 *
 * - `prod` is the Worker `egw-search`, served from where `SERVED_FROM`
 *   (`server/cloudflare/site.ts`) says. CI deploys it from `main`.
 * - Every other stage (`test_$USER`, `agent-*`, `pr-<n>`) is a throwaway
 *   Worker on a generated `workers.dev` URL over the same shared corpus.
 *   Destroying one leaves the corpus and the vectors where they are.
 *
 * Run it from this directory after `vite build`: the Worker serves `dist/`.
 * State lives in the Cloudflare state store, so every machine and CI see the
 * same resources.
 *
 * The Railway deployment it replaces is `./alchemy.railway.ts`, kept until
 * the cutover has held.
 */
import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect } from 'effect';

import Search from './server/cloudflare/Search.ts';
import { VectorFilters } from './server/cloudflare/resources.ts';

/** The stack's providers, shared with the deploy test's harness. */
export const providers = Cloudflare.providers();

export default Alchemy.Stack(
  'egw-search',
  { providers, state: Cloudflare.state() },
  Effect.gen(function* () {
    yield* VectorFilters;
    const search = yield* Search;
    return { url: search.url };
  }),
);
