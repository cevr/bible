/**
 * The Effect ↔ Solid 2 seam.
 *
 * Solid 2's async `createMemo` consumes a promise; Effect 4 produces an
 * `Effect`. The adapter is one function — `runQuery` — that runs an Effect to
 * a promise under a single `AbortSignal`, so Solid's own cancellation (a
 * superseded request, a disposed owner) becomes Effect interruption rather
 * than a lingering fetch whose result arrives late and overwrites a newer one.
 *
 * The request itself is an Effect so the retry, the timeout and the typed
 * failure are declared once, in one place, instead of being scattered across
 * the component as try/catch and stale-response guards.
 *
 * This module is a framework binding, not Effect domain code: it speaks the
 * browser's `fetch` and the server's JSON wire shape, whose nullable fields
 * are fixed by the two APIs it joins.
 */

/* oxlint-disable effect/noNullish -- the wire shape is JSON: `null` is what the server encodes an absent refcode, rank or link as, and re-encoding it as Option at the boundary would only move the decode into every reader. */
/* oxlint-disable effect/noAsyncFunction -- `Effect.tryPromise` takes a promise-returning callback, and `fetch` is the browser's own async API. */
/* oxlint-disable effect/noGlobals -- `fetch` is the platform primitive this binding exists to wrap; HttpClient would pull a platform layer into a module whose only job is one request. */
/* oxlint-disable effect/noThrowStatement, effect/noNewError -- throwing inside `tryPromise`'s callback is how a rejected promise is produced; `catch` maps it to the tagged error below. */
/* oxlint-disable effect/noAs -- the response body is `unknown` until it is decoded, and this binding hands it to a typed caller. */

import { Data, Effect } from 'effect';

export interface ContextParagraph {
  readonly refcode: string | null;
  readonly text: string;
}

/** One search hit, exactly as the server puts it on the wire.
 *
 *  `lexicalRank` and `vectorRank` are how a reader can tell whether a row is
 *  here because the words matched or because the meaning did — the observable
 *  difference hybrid search makes. Either is null when only one leg found it.
 */
export interface Hit {
  readonly refcode: string;
  readonly bookCode: string;
  readonly bookTitle: string;
  readonly author: string;
  readonly text: string;
  readonly lexicalRank: number | null;
  readonly vectorRank: number | null;
  readonly url: string | null;
  /** The paragraphs immediately around the match, so a hit reads in its own
   *  setting rather than as a stranded sentence. */
  readonly before: readonly ContextParagraph[];
  readonly after: readonly ContextParagraph[];
}

/** The answer, with the vector leg's own account of itself. `vector` is
 *  `'hybrid'` when the vector leg ran, and `'lexical — <reason>'` when §9.6's
 *  typed absence explains why it did not. */
export interface SearchOutcome {
  readonly hits: readonly Hit[];
  readonly topics?: readonly string[];
  readonly vector: string;
}

export class SearchError extends Data.TaggedError('SearchError')<{
  readonly message: string;
}> {}

/** A cold vector search pays for the embed before it can rank, so the ceiling
 *  is generous: the budget this guards is a hung socket, not a slow query. */
const REQUEST_TIMEOUT = '30 seconds';

const EMPTY: SearchOutcome = { hits: [], vector: 'idle' };

/**
 * One search request as an Effect. Interruption closes the underlying fetch
 * through the `AbortSignal` Effect hands to the callback, so a superseded
 * search stops in flight rather than resolving into a stale render.
 *
 * Two retries cover a transient network fault. A 500 is a considered answer
 * from the server, so it is not retried into a hammer.
 */
export const searchEffect = (
  query: string,
  limit: number,
  context: number,
): Effect.Effect<SearchOutcome, SearchError> => {
  const trimmed = query.trim();
  if (trimmed === '') return Effect.succeed(EMPTY);

  return Effect.tryPromise({
    try: async (signal) => {
      const url =
        `/api/search?q=${encodeURIComponent(trimmed)}` +
        `&limit=${String(limit)}&context=${String(context)}`;
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`search responded ${String(response.status)}`);
      return (await response.json()) as SearchOutcome;
    },
    catch: (cause) => new SearchError({ message: String(cause) }),
  }).pipe(
    Effect.timeout(REQUEST_TIMEOUT),
    Effect.retry({ times: 2 }),
    // `timeout` widens the error channel with its own failure; this brings the
    // channel back to the one type the caller handles.
    Effect.mapError(asSearchError),
  );
};

const asSearchError = (cause: unknown): SearchError => {
  if (cause instanceof SearchError) return cause;
  return new SearchError({ message: String(cause) });
};

/**
 * Run an Effect as a promise bound to an `AbortSignal`.
 *
 * This is the whole adapter. Solid 2 aborts the signal it hands a computation
 * when that computation is superseded or its owner disposed; forwarding the
 * signal to `Effect.runPromise` turns that into interruption, so a cancelled
 * search stops rather than resolving into a stale render.
 */
export const runQuery = <A, E>(effect: Effect.Effect<A, E>, signal: AbortSignal): Promise<A> =>
  Effect.runPromise(effect, { signal });
