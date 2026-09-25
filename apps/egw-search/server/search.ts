/* oxlint-disable effect/noNullish -- the HTTP wire shape is JSON: an absent refcode, rank or deep link is encoded as `null`, exactly as `./api.ts` declares it. */
/* oxlint-disable effect/noTernary -- one branch on §9.6's two-case vector status, rendered into a label. */

/**
 * Search preparation and result assembly.
 *
 * `GET /api/search`, `POST /api/search/batch` and the effect-frame query use
 * the same pipeline. A batch runs the canonical `SearchService.query` once per
 * input, then shares context reads by radius before assembling one response
 * per input.
 */

import { implementBatchedQuery } from 'effect-frame/actor';
import { Cause, Effect, Option, Result, Schema } from 'effect';
import type { SqlClient } from 'effect/unstable/sql';

import { SearchQuery, SearchService, type SearchResult } from '@bible/core/search';
import type { CorpusFilter } from '@bible/core/writings';

import { Search, SearchRequest } from '../src/contract.js';
import { readerUrl, SearchFailed, type SearchResponse, type SearchSlot } from './api.js';
import { emptySurrounding, surroundingParagraphs, type Surrounding } from './context.js';

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;
const DEFAULT_CONTEXT = 1;
const MAX_CONTEXT = 3;
const requestEquivalence = Schema.toEquivalence(SearchRequest);

/** This surface never returns lookup apparatus.
 *
 * A row like `TopIndex .Trouble, Troubles.61` is a see-also stub. It matches
 * a topical query on almost every term in it, so the indexes rank *well* for
 * exactly the queries this app is for and push the prose a reader came to
 * read off the page. Forced on rather than defaulted, because it is a
 * property of this surface; a reader who wants them can still select
 * `type=dictionary` explicitly, which names them positively. */
const NEVER_APPARATUS = true;

const clamp = (raw: number, fallback: number, max: number): number => {
  if (!Number.isFinite(raw) || raw < 0) return fallback;
  return Math.min(Math.trunc(raw), max);
};

interface PreparedSearch {
  readonly request: SearchRequest;
  readonly text: string;
  readonly scope: SearchRequest['scope'];
  readonly limit: number;
  readonly radius: number;
  readonly filter: CorpusFilter;
}

interface SuccessfulSearch {
  readonly prepared: PreparedSearch;
  readonly result: SearchResult;
}

type ContextLookup = (
  anchors: readonly string[],
  radius: number,
) => Effect.Effect<ReadonlyMap<string, Surrounding>, never, SqlClient.SqlClient>;

const prepare = (request: SearchRequest): PreparedSearch => ({
  request,
  text: request.q.trim(),
  scope: request.scope,
  limit: clamp(request.limit, DEFAULT_LIMIT, MAX_LIMIT),
  radius: clamp(request.context, DEFAULT_CONTEXT, MAX_CONTEXT),
  filter: {
    section: request.section,
    type: request.type,
    subtype: request.subtype,
    // Always on for this surface (see `NEVER_APPARATUS`); the field stays
    // on the wire so a link can still say so explicitly.
    excludeApparatus: NEVER_APPARATUS,
  },
});

const idleResponse = (scope: SearchRequest['scope']): SearchResponse => ({
  hits: [],
  scope,
  vector: 'idle',
  nonSelective: false,
});

/** Run only retrieval. Context is added after all batch inputs finish. */
const queryOne = (
  prepared: PreparedSearch,
  search: SearchService['Service'],
): Effect.Effect<Option.Option<SearchResult>, SearchFailed> =>
  Effect.gen(function* () {
    if (prepared.text === '') return Option.none();
    const result = yield* search.query(
      SearchQuery.make({
        text: prepared.text,
        // `'all'` is passed as `none` rather than as the literal: the service
        // treats an absent scope as unfiltered.
        scope: prepared.scope === 'all' ? Option.none() : Option.some(prepared.scope),
        bookCode: Option.none(),
        filter: prepared.filter,
        limit: Option.some(prepared.limit),
      }),
    );
    return Option.some(result);
  }).pipe(
    Effect.catchCause((cause) => {
      if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
      return Effect.logError('search.failed').pipe(
        Effect.annotateLogs({ cause: String(cause) }),
        Effect.andThen(Effect.fail(SearchFailed.make({ message: 'search failed' }))),
      );
    }),
  );

const distinct = (values: readonly string[]): readonly string[] => [...new Set(values)];

/** Match decoded values by the contract's data equality, not object identity.
 * The host currently passes the same objects back to the resolver, but the
 * resolver's contract is about arguments, so this keeps the seam independent
 * of that implementation detail. */
const findRequest = <A>(
  entries: ReadonlyArray<readonly [SearchRequest, A]>,
  request: SearchRequest,
): Option.Option<A> => {
  for (const [candidate, value] of entries) {
    if (requestEquivalence(candidate, request)) return Option.some(value);
  }
  return Option.none();
};

const anchorsOf = (successful: SuccessfulSearch): readonly string[] =>
  successful.result.paragraphs
    .slice(0, successful.prepared.limit)
    .flatMap((hit) => Option.match(hit.rawParaId, { onNone: () => [], onSome: (id) => [id] }));

/** Fetch context once per radius, over all successful inputs at that radius. */
const contextsFor = (
  successful: readonly SuccessfulSearch[],
  lookup: ContextLookup,
): Effect.Effect<
  ReadonlyMap<number, ReadonlyMap<string, Surrounding>>,
  never,
  SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const grouped = new Map<number, string[]>();
    for (const one of successful) {
      const anchors = grouped.get(one.prepared.radius);
      if (anchors === undefined) {
        grouped.set(one.prepared.radius, [...anchorsOf(one)]);
      } else {
        anchors.push(...anchorsOf(one));
      }
    }

    const contexts = new Map<number, ReadonlyMap<string, Surrounding>>();
    for (const [radius, rawAnchors] of grouped) {
      const anchors = distinct(rawAnchors);
      const startedAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
      const context = yield* lookup(anchors, radius).pipe(
        Effect.withSpan('search.context', { attributes: { anchors: anchors.length, radius } }),
      );
      yield* Effect.logInfo('search.context.timing').pipe(
        Effect.annotateLogs({
          anchors: anchors.length,
          radius,
          contextMs: (yield* Effect.clockWith((clock) => clock.currentTimeMillis)) - startedAt,
        }),
      );
      contexts.set(radius, context);
    }
    return contexts;
  });

const responseFor = (
  prepared: PreparedSearch,
  result: SearchResult,
  context: ReadonlyMap<string, Surrounding>,
): SearchResponse => ({
  hits: result.paragraphs.slice(0, prepared.limit).map((hit) => {
    const around = Option.match(hit.rawParaId, {
      onNone: () => emptySurrounding,
      onSome: (id) => context.get(id) ?? emptySurrounding,
    });
    return {
      refcode: Option.getOrNull(hit.refcode),
      bookCode: hit.bookCode,
      bookTitle: hit.bookTitle,
      author: hit.author,
      text: hit.snippet,
      isHeading: hit.isHeading,
      backMatter: hit.backMatter,
      lexicalRank: Option.getOrNull(hit.lexicalRank),
      vectorRank: Option.getOrNull(hit.vectorRank),
      url: Option.match(hit.rawParaId, { onNone: () => null, onSome: readerUrl }),
      before: around.before,
      after: around.after,
    };
  }),
  scope: prepared.scope,
  vector: result.vector._tag === 'ran' ? 'hybrid' : `lexical — ${result.vector.reason}`,
  nonSelective: result.nonSelective,
});

/** The legacy one-request path uses the same retrieval, context, and assembly. */
export const runSearch = (
  request: SearchRequest,
): Effect.Effect<SearchResponse, SearchFailed, SearchService | SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const search = yield* SearchService;
    const prepared = prepare(request);
    const result = yield* queryOne(prepared, search);
    if (Option.isNone(result)) return idleResponse(prepared.scope);
    const contexts = yield* contextsFor(
      [{ prepared, result: result.value }],
      surroundingParagraphs,
    );
    return responseFor(prepared, result.value, contexts.get(prepared.radius) ?? new Map());
  });

/** A batch's inputs in order, each answered by its own slot. */
type BatchInput = ReadonlyArray<SearchRequest>;

/** Answer a batch without repeating context SQL for each input.
 *
 *  Exported with its lookup as a parameter so a test can count the context
 *  statements; `runSearchBatch` below is the one the endpoint serves. */
export const runSearchBatchWith = (
  requests: BatchInput,
  lookup: ContextLookup,
): Effect.Effect<ReadonlyArray<SearchSlot>, never, SearchService | SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const search = yield* SearchService;
    const prepared = requests.map(prepare);
    const outcomes = yield* Effect.forEach(
      prepared,
      (one) => Effect.result(queryOne(one, search)),
      { concurrency: 16 },
    );

    const successful: SuccessfulSearch[] = [];
    for (const [index, outcome] of outcomes.entries()) {
      const one = prepared[index];
      if (one === undefined || Result.isFailure(outcome) || Option.isNone(outcome.success)) {
        continue;
      }
      successful.push({ prepared: one, result: outcome.success.value });
    }
    const contexts = yield* contextsFor(successful, lookup);

    return outcomes.map((outcome, index): SearchSlot => {
      const one = prepared[index];
      if (Result.isFailure(outcome)) return { _tag: 'Failed', message: outcome.failure.message };
      if (one === undefined || Option.isNone(outcome.success)) {
        return { _tag: 'Answered', response: idleResponse(requests[index]?.scope ?? 'all') };
      }
      return {
        _tag: 'Answered',
        response: responseFor(one, outcome.success.value, contexts.get(one.radius) ?? new Map()),
      };
    });
  });

/** The batch endpoint's pipeline, over the real context lookup. */
export const runSearchBatch = (requests: BatchInput) =>
  runSearchBatchWith(requests, surroundingParagraphs);

/** Resolve one actor batch without repeating context SQL for each input. */
const resolveSearchWith = (
  requests: ReadonlyArray<SearchRequest>,
  lookup: ContextLookup,
): Effect.Effect<
  (request: SearchRequest) => Effect.Effect<SearchResponse, SearchFailed>,
  never,
  SearchService | SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const search = yield* SearchService;
    const prepared = requests.map(prepare);
    const outcomes = yield* Effect.forEach(
      prepared,
      (one) => Effect.map(Effect.result(queryOne(one, search)), (result) => ({ one, result })),
      { concurrency: 16 },
    );

    const responses: Array<readonly [SearchRequest, SearchResponse]> = [];
    const failures: Array<readonly [SearchRequest, SearchFailed]> = [];
    const successful: SuccessfulSearch[] = [];
    for (const outcome of outcomes) {
      if (Result.isFailure(outcome.result)) {
        failures.push([outcome.one.request, outcome.result.failure]);
      } else if (Option.isNone(outcome.result.success)) {
        responses.push([outcome.one.request, idleResponse(outcome.one.scope)]);
      } else {
        successful.push({ prepared: outcome.one, result: outcome.result.success.value });
      }
    }

    const contexts = yield* contextsFor(successful, lookup);
    for (const one of successful) {
      responses.push([
        one.prepared.request,
        responseFor(one.prepared, one.result, contexts.get(one.prepared.radius) ?? new Map()),
      ]);
    }

    return (request: SearchRequest): Effect.Effect<SearchResponse, SearchFailed> => {
      const failure = findRequest(failures, request);
      if (Option.isSome(failure)) return Effect.fail(failure.value);
      const response = findRequest(responses, request);
      if (Option.isSome(response)) return Effect.succeed(response.value);
      return Effect.fail(SearchFailed.make({ message: 'search batch omitted input' }));
    };
  });

const resolveSearch = (requests: ReadonlyArray<SearchRequest>) =>
  resolveSearchWith(requests, surroundingParagraphs);

/** The query host's declared batched implementation. */
export const SearchLive = implementBatchedQuery(Search, { resolve: resolveSearch });
