import type { EGWApiClientError } from '@bible/core/egw';
import { Context, Effect, Layer } from 'effect';

import type { SearchHit as IpcSearchHit } from '../../electron/preload.js';
import { EGWIpcClient } from './egw-ipc-client.js';

/**
 * Unified search result row. `source` tells the UI whether the hit came from
 * the local FTS index (instant, always available offline) or a live EGW
 * search query (slower, requires network + auth, returns server-side snippet).
 *
 * Local hits carry a `bookId` because the indexer knows it; remote hits don't
 * (the API returns `pub_code`/`pub_name` instead of the internal id).
 */
export interface SearchResult {
  readonly source: 'local' | 'remote';
  readonly bookId: number | null;
  readonly bookCode: string;
  readonly bookTitle: string;
  readonly paraId: string | null;
  readonly refcodeShort: string | null;
  readonly snippet: string | null;
  readonly puborder: number | null;
}

export interface SearchServiceShape {
  /**
   * Local-only refcode lookup (e.g. "PP 351.1"). Returns all paragraphs whose
   * `refcode_short` matches exactly (case-insensitive). Refcode hits are
   * always local: a refcode resolves to a specific paragraph the user has
   * downloaded; if it's not in the index, the right answer isn't "fetch the
   * remote search hit" — it's "the user needs to download the book first."
   */
  readonly byRefcode: (refcode: string, limit?: number) => Effect.Effect<readonly SearchResult[]>;

  /**
   * Local-first full-text search. Hits the local FTS5 index; if it returns
   * fewer than `localMinResults` (default 1), falls back to the live EGW
   * /search endpoint and merges in remote hits. The boolean `online` arg
   * forces remote-only — useful for "search the whole EGW library" UI
   * affordance even when local has plenty.
   */
  readonly byText: (
    query: string,
    options?: { readonly limit?: number; readonly bookCode?: string; readonly online?: boolean },
  ) => Effect.Effect<readonly SearchResult[], EGWApiClientError>;
}

export class SearchService extends Context.Service<SearchService, SearchServiceShape>()(
  '@bible/desktop/services/SearchService',
) {
  static layer = Layer.effect(
    SearchService,
    Effect.gen(function* () {
      const client = yield* EGWIpcClient;

      const localToResult = (hit: IpcSearchHit): SearchResult => ({
        source: 'local',
        bookId: hit.bookId,
        bookCode: hit.bookCode,
        bookTitle: hit.bookTitle,
        paraId: hit.paraId,
        refcodeShort: hit.refcodeShort,
        snippet: hit.snippet,
        puborder: hit.puborder,
      });

      const byRefcode: SearchServiceShape['byRefcode'] = (refcode, limit) =>
        Effect.gen(function* () {
          const local = yield* Effect.promise(() => window.api.search.refcode(refcode, limit));
          if (local.length > 0) return local.map(localToResult);
          // Fall back to the live EGW /search endpoint when local has nothing
          // — the user might be querying a book they haven't downloaded yet.
          // Catch-all keeps an offline / unauthenticated UI quiet (empty list
          // is friendlier than a thrown error in the search panel).
          const remote = yield* client
            .search({ query: refcode, limit: limit ?? 5 })
            .pipe(Effect.catch(() => Effect.succeed({ results: [] })));
          return remote.results.map(
            (hit): SearchResult => ({
              source: 'remote',
              bookId: null,
              bookCode: hit.pub_code,
              bookTitle: hit.pub_name,
              paraId: hit.para_id ?? null,
              refcodeShort: hit.refcode_short ?? null,
              snippet: hit.snippet ?? null,
              puborder: null,
            }),
          );
        });

      const byText: SearchServiceShape['byText'] = (query, options = {}) =>
        Effect.gen(function* () {
          const { limit = 50, bookCode, online = false } = options;

          if (online) {
            const remote = yield* client.search({ query, limit });
            return remote.results.map(
              (hit): SearchResult => ({
                source: 'remote',
                bookId: null,
                bookCode: hit.pub_code,
                bookTitle: hit.pub_name,
                paraId: hit.para_id ?? null,
                refcodeShort: hit.refcode_short ?? null,
                snippet: hit.snippet ?? null,
                puborder: null,
              }),
            );
          }

          const local = yield* Effect.promise(() => window.api.search.fts(query, limit, bookCode));
          if (local.length > 0) return local.map(localToResult);

          // Local index returned nothing — fall back to the live search so the
          // user gets a result even for content they haven't downloaded yet.
          // Catch-all on the remote call: if the network or auth is down, an
          // empty list is friendlier than a thrown error for an empty search.
          const remote = yield* client
            .search({ query, limit })
            .pipe(Effect.catch(() => Effect.succeed({ results: [] })));
          return remote.results.map(
            (hit): SearchResult => ({
              source: 'remote',
              bookId: null,
              bookCode: hit.pub_code,
              bookTitle: hit.pub_name,
              paraId: hit.para_id ?? null,
              refcodeShort: hit.refcode_short ?? null,
              snippet: hit.snippet ?? null,
              puborder: null,
            }),
          );
        });

      return { byRefcode, byText };
    }),
  );

  /** Stub layer for tests — returns empty results. Override fields to inject hits. */
  static layerTest = (overrides: Partial<SearchServiceShape> = {}) =>
    Layer.succeed(SearchService, {
      byRefcode: () => Effect.succeed([]),
      byText: () => Effect.succeed([]),
      ...overrides,
    });
}
