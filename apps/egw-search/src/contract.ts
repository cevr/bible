/**
 * The search query, as an effect-frame contract.
 *
 * Client-safe: schemas only. The browser bundle and the server both import
 * this file, so the wire has exactly one definition. The `HttpApi` in
 * `../server/api.ts` still serves `/api/search` for the CLI-style JSON
 * consumer and for the parity diff; this contract is what the page reads
 * through the actor transport at `/actors`.
 *
 * No actor commits change the corpus, so nothing marks a result stale but an
 * explicit refresh; the contract declares no dependency.
 */

import { batchedQuery } from 'effect-frame/actor/client';

import { SearchRequest, SearchResponseSchema } from '../server/api.js';

/** The request is the JSON API's batch input; the page and the batch
 *  endpoint send the same shape. */
export { SearchRequest };

/** The one policy name this app declares. The search box needs no sign-in, so
 *  the server's table (`../server/policies.ts`) maps it to allow-all. */
export const PUBLIC_POLICY = 'public';

/** Version 1, dependent on no actor, and readable by anyone. */
export const Search = batchedQuery('search', {
  version: 1,
  depends: [],
  args: SearchRequest,
  result: SearchResponseSchema,
  policy: PUBLIC_POLICY,
});

/** The actor transport's mount point, shared by the server and the client. */
export const actorPrefix = '/actors';
