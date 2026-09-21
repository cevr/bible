/* oxlint-disable effect/noNullish -- the HTTP wire shape is JSON: an absent refcode, rank or deep link is encoded as `null`, exactly as `./api.ts` declares it. */
/* oxlint-disable effect/noTernary -- one branch on §9.6's two-case vector status, rendered into a label. */

/**
 * One search, answered whole.
 *
 * Shared by the two servers of the same answer: the `HttpApi` handler in
 * `./main.ts` (`GET /api/search`) and the effect-frame query implementation
 * below (`POST /actors/query`). One function, so the two wires cannot drift
 * in what they consider a hit, a heading, or a degraded vector leg.
 */

import { implementQuery } from 'effect-frame/actor';
import { Effect, Option } from 'effect';
import type { SqlClient } from 'effect/unstable/sql';

import { SearchQuery, SearchService } from '@bible/core/search';
import type { CorpusFilter } from '@bible/core/writings';

import { Search, type SearchRequest } from '../src/contract.js';
import { readerUrl, SearchFailed, type SearchResponse } from './api.js';
import { emptySurrounding, surroundingParagraphs } from './context.js';

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;
const DEFAULT_CONTEXT = 1;
const MAX_CONTEXT = 3;

/** This surface never returns lookup apparatus.
 *
 *  A row like `TopIndex .Trouble, Troubles.61` is a see-also stub. It matches
 *  a topical query on almost every term in it, so the indexes rank *well* for
 *  exactly the queries this app is for and push the prose a reader came to
 *  read off the page. Forced on rather than defaulted, because it is a
 *  property of this surface; a reader who wants them can still select
 *  `type=dictionary` explicitly, which names them positively. */
const NEVER_APPARATUS = true;

const clamp = (raw: number, fallback: number, max: number): number => {
  if (!Number.isFinite(raw) || raw < 0) return fallback;
  return Math.min(Math.trunc(raw), max);
};

export const runSearch = (
  params: SearchRequest,
): Effect.Effect<SearchResponse, SearchFailed, SearchService | SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const search = yield* SearchService;
    const text = params.q.trim();
    const scope = params.scope;
    const filter: CorpusFilter = {
      section: params.section,
      type: params.type,
      subtype: params.subtype,
      // Always on for this surface (see `NEVER_APPARATUS`); the field stays
      // on the wire so a link can still say so explicitly.
      excludeApparatus: NEVER_APPARATUS,
    };
    if (text === '') return { hits: [], scope, vector: 'idle', nonSelective: false };

    const limit = clamp(params.limit, DEFAULT_LIMIT, MAX_LIMIT);
    const radius = clamp(params.context, DEFAULT_CONTEXT, MAX_CONTEXT);

    const result = yield* search.query(
      SearchQuery.make({
        text,
        // `'all'` is passed as `none` rather than as the literal: the service
        // treats an absent scope as unfiltered.
        scope: scope === 'all' ? Option.none() : Option.some(scope),
        bookCode: Option.none(),
        filter,
        limit: Option.some(limit),
      }),
    );

    const paragraphs = result.paragraphs.slice(0, limit);

    // One batched lookup for the whole page's context, keyed on `rawParaId`:
    // the bare `para_id` the `paragraphs` table holds, not §9.4's fusion
    // identity. A hit without one has no addressable paragraph and simply
    // contributes no anchor.
    const anchors = paragraphs.flatMap((hit) =>
      Option.match(hit.rawParaId, { onNone: () => [], onSome: (id) => [id] }),
    );
    const contextAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
    const context = yield* surroundingParagraphs(anchors, radius).pipe(
      Effect.withSpan('search.context', { attributes: { anchors: anchors.length } }),
    );
    yield* Effect.logInfo('search.context.timing').pipe(
      Effect.annotateLogs({
        anchors: anchors.length,
        radius,
        contextMs: (yield* Effect.clockWith((clock) => clock.currentTimeMillis)) - contextAt,
      }),
    );

    return {
      hits: paragraphs.map((hit) => {
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
          lexicalRank: Option.getOrNull(hit.lexicalRank),
          vectorRank: Option.getOrNull(hit.vectorRank),
          url: Option.match(hit.rawParaId, { onNone: () => null, onSome: readerUrl }),
          before: around.before,
          after: around.after,
        };
      }),
      scope,
      vector: result.vector._tag === 'ran' ? 'hybrid' : `lexical — ${result.vector.reason}`,
      nonSelective: result.nonSelective,
    };
  }).pipe(
    Effect.tapCause((cause) =>
      Effect.logError('search.failed').pipe(Effect.annotateLogs({ cause: String(cause) })),
    ),
    Effect.mapError(() => SearchFailed.make({ message: 'search failed' })),
  );

/** The query as the actor host serves it. */
export const SearchLive = implementQuery(Search, runSearch);
