/**
 * The Effect ↔ Solid 2 seam.
 *
 * The client is *derived* from `SearchApi` — the same `HttpApi` the server
 * builds its handlers from — rather than hand-written against `fetch`. One
 * schema defines both ends: the batch is encoded from the endpoint's declared
 * payload, the answer is decoded through `SearchSlot` instead of asserted with
 * a cast, and a server-side shape change becomes a type error here instead of
 * a runtime surprise at render.
 *
 * `runQuery` is the whole adapter to Solid: it runs an Effect to a promise
 * under one `AbortSignal`, so Solid's own cancellation — a superseded request,
 * a disposed pane — becomes Effect interruption rather than a lingering fetch
 * whose result arrives late.
 */

import { Effect, Exit, Option, Schema as S } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { HttpApiClient } from 'effect/unstable/httpapi';

import {
  MAX_BATCH,
  SearchApi,
  SearchRequest,
  type SearchResponse,
  type SearchSlot,
} from '../server/api.js';
import { makeBatcher } from './batch.js';

export type Hit = SearchResponse['hits'][number];
export type ContextParagraph = Hit['before'][number];

/** A cold vector search pays for the embed before it can rank, so the ceiling
 *  is generous: the budget this guards is a hung socket, not a slow query. */
const REQUEST_TIMEOUT = '30 seconds';

/** How long a batch waits for the other panes' searches. Panes that start
 *  together start within a few milliseconds of each other. */
const BATCH_WINDOW = '10 millis';

/** The failure a pane renders: the server's word for one search, or the
 *  transport's for the whole batch. */
export class SearchError extends S.TaggedError<SearchError>()('SearchError', {
  message: S.String,
}) {}

/** The derived client, built once rather than per search. */
const client = HttpApiClient.make(SearchApi).pipe(
  Effect.provide(FetchHttpClient.layer),
  Effect.cached,
  Effect.runSync,
);

const slotExit = (slot: SearchSlot): Exit.Exit<SearchResponse, SearchError> => {
  if (slot._tag === 'Failed') return Exit.fail(SearchError.make({ message: slot.message }));
  return Exit.succeed(slot.response);
};

/**
 * One round trip for every search that starts in the same window.
 *
 * Two retries cover a transient network fault. A slot's `Failed` is a
 * considered answer from the server and is not retried: it is not an error
 * of the request, only of that slot.
 */
const batcher = makeBatcher<SearchRequest, SearchResponse, SearchError>({
  window: BATCH_WINDOW,
  maxSize: MAX_BATCH,
  run: (requests) =>
    client.pipe(
      Effect.flatMap((api) => api.search.batch({ payload: { requests } })),
      Effect.timeout(REQUEST_TIMEOUT),
      Effect.retry({ times: 2 }),
      Effect.map(({ results }) => results.map(slotExit)),
      Effect.mapError((cause) => SearchError.make({ message: String(cause) })),
    ),
});

// ---------------------------------------------------------------------------
// Answers already seen
// ---------------------------------------------------------------------------

/** How many answers the page keeps. Enough for a reader's recent history
 *  across four panes; each is one page of hits. */
const REMEMBERED = 64;

/** Answers by request, most recent last. Back and Forward return to a
 *  workspace the reader has seen, and its panes draw at once from here, so
 *  the entry's scroll position lands on the rows it was saved against.
 *  Failures are not kept: a retry must ask again. */
const answers = new Map<string, SearchResponse>();

/** A request's key: its JSON, through the request's own schema. */
const keyOf = S.encodeSync(S.fromJsonString(SearchRequest));

export const remembered = (request: SearchRequest): Option.Option<SearchResponse> =>
  Option.fromUndefinedOr(answers.get(keyOf(request)));

const remember = (request: SearchRequest, response: SearchResponse): void => {
  const key = keyOf(request);
  answers.delete(key);
  answers.set(key, response);
  for (const oldest of answers.keys()) {
    if (answers.size <= REMEMBERED) break;
    answers.delete(oldest);
  }
};

/** One search, through the batch, remembered once answered. */
export const search = (request: SearchRequest): Effect.Effect<SearchResponse, SearchError> =>
  batcher
    .submit(request)
    .pipe(Effect.tap((response) => Effect.sync(() => remember(request, response))));

/**
 * Run an Effect as a promise bound to an `AbortSignal`.
 *
 * The caller aborts the signal when the computation that asked is superseded
 * or disposed; forwarding it to `Effect.runPromise` turns that into
 * interruption, which leaves the batch (see `./batch.ts`).
 */
export const runQuery = <A, E>(effect: Effect.Effect<A, E>, signal: AbortSignal): Promise<A> =>
  Effect.runPromise(effect, { signal });
