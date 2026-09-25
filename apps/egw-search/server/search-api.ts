/* oxlint-disable effect/noNullish -- the `HttpApi` leaves each optional query parameter `undefined`, and `??` applies the JSON wire's default at that boundary. */

/**
 * The JSON API's handlers: `/api/search`, `/api/search/batch` and `/health`.
 *
 * Its own module, apart from `./main.ts`, so a test can serve the same group
 * over a fixture corpus. `./main.ts` builds the process; this is what answers.
 */

import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/unstable/httpapi';
import type { SqlClient } from 'effect/unstable/sql';

import type { SearchService } from '@bible/core/search';

import { NO_SELECTION, SearchApi } from './api.js';
import { runSearch, runSearchBatch } from './search.js';
import { VectorIndexLoad } from './vector-index.js';

const DEFAULT_LIMIT = 40;
const DEFAULT_CONTEXT = 1;

/** The JSON wire's defaults, applied where the `HttpApi` leaves a field
 *  optional. `runSearch` in `./search.ts` takes the full request. */
export const SearchGroupLive = HttpApiBuilder.group(SearchApi, 'search', (handlers) =>
  Effect.gen(function* () {
    // Resolved once, when the group is built, so a request carries no
    // requirement of its own out through the router.
    const services = yield* Effect.context<SearchService | SqlClient.SqlClient>();
    const load = yield* VectorIndexLoad;
    return handlers
      .handle('health', () => Effect.map(load.readiness, (vector) => ({ ok: true, vector })))
      .handle('query', ({ query: params }) =>
        runSearch({
          q: params.q,
          scope: params.scope ?? 'all',
          section: params.section ?? NO_SELECTION,
          type: params.type ?? NO_SELECTION,
          subtype: params.subtype ?? NO_SELECTION,
          excludeApparatus: params.noref === '1',
          limit: params.limit ?? DEFAULT_LIMIT,
          context: params.context ?? DEFAULT_CONTEXT,
        }).pipe(Effect.provideContext(services)),
      )
      .handle('batch', ({ payload }) =>
        Effect.map(runSearchBatch(payload.requests), (results) => ({ results })).pipe(
          Effect.provideContext(services),
        ),
      );
  }),
);
