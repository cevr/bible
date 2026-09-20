/**
 * The Effect ↔ Solid 2 seam.
 *
 * The client is *derived* from `SearchApi` — the same `HttpApi` the server
 * builds its handlers from — rather than hand-written against `fetch`. One
 * schema now defines both ends: the query string is encoded from the
 * endpoint's declared `q`/`limit`/`context`, the response is decoded through
 * `SearchResponseSchema` instead of asserted with a cast, and `SearchFailed`
 * arrives as the tagged error the server declared rather than a flattened
 * string. A server-side shape change becomes a type error here instead of a
 * runtime surprise at render.
 *
 * `runQuery` is the whole adapter to Solid: it runs an Effect to a promise
 * under one `AbortSignal`, so Solid's own cancellation — a superseded request,
 * a disposed owner — becomes Effect interruption rather than a lingering fetch
 * whose result arrives late and overwrites a newer one.
 */

import { Effect, Layer, Schema as S } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { HttpApiClient } from 'effect/unstable/httpapi';

import {
  type CorpusScope,
  SearchApi,
  SearchFailed,
  type SearchResponseSchema,
} from '../server/api.js';
import { toQuery, type SearchParams } from './url-state.js';

/** The wire types, taken from the API's own schemas rather than restated.
 *
 *  These were previously hand-written interfaces that had to be kept in step
 *  with `server/api.ts` by hand; deriving them means the compiler does it. */
export type SearchResponse = S.Schema.Type<typeof SearchResponseSchema>;
export type Hit = SearchResponse['hits'][number];
export type ContextParagraph = Hit['before'][number];

/** What the component renders. The API's response plus the idle case, which is
 *  a client-side state (no query yet) rather than anything the server returns. */
export interface SearchOutcome {
  readonly hits: readonly Hit[];
  readonly scope: CorpusScope;
  readonly vector: string;
  /** The query matched too much of the corpus to rank — see the server's
   *  selectivity gate. Distinct from "nothing matched", which is what an empty
   *  `hits` otherwise means. */
  readonly nonSelective: boolean;
}

const EMPTY: SearchOutcome = { hits: [], scope: 'all', vector: 'idle', nonSelective: false };

/** A cold vector search pays for the embed before it can rank, so the ceiling
 *  is generous: the budget this guards is a hung socket, not a slow query. */
const REQUEST_TIMEOUT = '30 seconds';

/** The derived client, built once.
 *
 *  `HttpApiClient.make` needs an `HttpClient`; in the browser that is
 *  `FetchHttpClient`, whose transport is the platform `fetch` this module used
 *  to call directly. Memoising the layer keeps one client per process rather
 *  than rebuilding the encoder/decoder pair per keystroke. */
const ClientLive = Layer.mergeAll(FetchHttpClient.layer);

const client = Effect.gen(function* () {
  return yield* HttpApiClient.make(SearchApi);
}).pipe(Effect.provide(ClientLive), Effect.cached, Effect.runSync);

/**
 * One search request.
 *
 * Interruption closes the underlying fetch through the `AbortSignal` Effect
 * propagates, so a superseded search stops in flight rather than resolving
 * into a stale render.
 *
 * Two retries cover a transient network fault. A `SearchFailed` is a
 * considered answer from the server, so it is not retried into a hammer —
 * `Effect.retry` here only sees the transport errors, because the tagged
 * failure is caught first.
 */
export const searchEffect = (
  params: SearchParams,
  context: number,
): Effect.Effect<SearchOutcome, SearchError> => {
  const trimmed = params.q.trim();
  if (trimmed === '') return Effect.succeed(EMPTY);

  return client.pipe(
    Effect.flatMap((api) => api.search.query({ query: { ...toQuery(params), context } })),
    Effect.timeout(REQUEST_TIMEOUT),
    Effect.retry({ times: 2 }),
    Effect.mapError(asSearchError),
  );
};

/** The component handles one failure type; this collapses the derived client's
 *  three (the server's `SearchFailed`, a transport error, and a decode error)
 *  into it while keeping each one's own message. */
export class SearchError extends S.TaggedError<SearchError>()('SearchError', {
  message: S.String,
}) {}

const isSearchError = S.is(SearchError);
const isSearchFailed = S.is(SearchFailed);

/** Collapse the derived client's three failure types into the one the
 *  component renders, keeping each one's own wording.
 *
 *  `SearchFailed` is the server's declared error and is matched by its schema
 *  rather than by probing for a `message` field — the transport and decode
 *  errors are `Error` subclasses, so `String(cause)` already renders them
 *  usefully ("HttpClientError: ..."). */
const asSearchError = (cause: unknown): SearchError => {
  if (isSearchError(cause)) return cause;
  if (isSearchFailed(cause)) return SearchError.make({ message: cause.message });
  return SearchError.make({ message: String(cause) });
};

/**
 * Run an Effect as a promise bound to an `AbortSignal`.
 *
 * Solid 2 aborts the signal it hands a computation when that computation is
 * superseded or its owner disposed; forwarding it to `Effect.runPromise` turns
 * that into interruption.
 */
export const runQuery = <A, E>(effect: Effect.Effect<A, E>, signal: AbortSignal): Promise<A> =>
  Effect.runPromise(effect, { signal });
