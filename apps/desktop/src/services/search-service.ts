import type { EGWApiClientError } from '@bible/core/egw';
import { Context, Effect, Layer, Option } from 'effect';

import type { SearchHit as IpcSearchHit } from '../../electron/preload.js';
import { EGWIpcClient } from './egw-ipc-client.js';

/**
 * Unified search result row, tagged by `source`. Local hits come from the
 * FTS5 index (always available, carries the indexer's bookId/paraId/puborder
 * so the renderer can navigate to the paragraph). Remote hits come from the
 * live EGW /search endpoint (no bookId/puborder — the API returns
 * pub_code/pub_name instead — and paraId is whatever the server volunteered).
 *
 * Splitting into a tagged variant makes the "is this clickable?" guard a
 * single discriminator check at the call site instead of a 3-way null fence.
 */
export type SearchResult =
  | {
      readonly source: 'local';
      readonly bookId: number;
      readonly bookCode: string;
      readonly bookTitle: string;
      readonly paraId: string;
      readonly refcodeShort: Option.Option<string>;
      readonly snippet: Option.Option<string>;
      readonly puborder: number;
    }
  | {
      readonly source: 'remote';
      readonly bookCode: string;
      readonly bookTitle: string;
      readonly paraId: Option.Option<string>;
      readonly refcodeShort: Option.Option<string>;
      readonly snippet: Option.Option<string>;
    };

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

      // Local hits without a para_id are dropped at the boundary — they
      // can't be navigated to (the reader keys by paraId) so showing them
      // in the list would mean displaying unclickable rows. Filtering here
      // keeps the renderer-visible `SearchResult` total: every local hit is
      // navigable.
      const localToResult = (hit: IpcSearchHit): SearchResult | null =>
        hit.paraId === null
          ? null
          : {
              source: 'local',
              bookId: hit.bookId,
              bookCode: hit.bookCode,
              bookTitle: hit.bookTitle,
              paraId: hit.paraId,
              refcodeShort: Option.fromNullOr(hit.refcodeShort),
              snippet: Option.some(hit.snippet),
              puborder: hit.puborder,
            };

      const mapLocal = (hits: readonly IpcSearchHit[]): readonly SearchResult[] => {
        const out: SearchResult[] = [];
        for (const h of hits) {
          const r = localToResult(h);
          if (r !== null) out.push(r);
        }
        return out;
      };

      const remoteToResult = (hit: {
        readonly pub_code: string;
        readonly pub_name: string;
        readonly para_id?: string | null | undefined;
        readonly refcode_short?: string | null | undefined;
        readonly snippet?: string | null | undefined;
      }): SearchResult => ({
        source: 'remote',
        bookCode: hit.pub_code,
        bookTitle: hit.pub_name,
        paraId: Option.fromNullishOr(hit.para_id),
        refcodeShort: Option.fromNullishOr(hit.refcode_short),
        snippet: Option.fromNullishOr(hit.snippet),
      });

      const byRefcode: SearchServiceShape['byRefcode'] = (refcode, limit) =>
        Effect.gen(function* () {
          const local = yield* Effect.promise(() => window.api.search.refcode(refcode, limit));
          if (local.length > 0) return mapLocal(local);
          // Fall back to the live EGW /search endpoint when local has nothing
          // — the user might be querying a book they haven't downloaded yet.
          // Catch-all keeps an offline / unauthenticated UI quiet (empty list
          // is friendlier than a thrown error in the search panel).
          const remote = yield* client
            .search({ query: refcode, limit: limit ?? 5 })
            .pipe(Effect.catch(() => Effect.succeed({ results: [] })));
          return remote.results.map(remoteToResult);
        });

      const byText: SearchServiceShape['byText'] = (query, options = {}) =>
        Effect.gen(function* () {
          const { limit = 50, bookCode, online = false } = options;

          if (online) {
            const remote = yield* client.search({ query, limit });
            return remote.results.map(remoteToResult);
          }

          const local = yield* Effect.promise(() => window.api.search.fts(query, limit, bookCode));
          if (local.length > 0) return mapLocal(local);

          // Local index returned nothing — fall back to the live search so the
          // user gets a result even for content they haven't downloaded yet.
          // Catch-all on the remote call: if the network or auth is down, an
          // empty list is friendlier than a thrown error for an empty search.
          const remote = yield* client
            .search({ query, limit })
            .pipe(Effect.catch(() => Effect.succeed({ results: [] })));
          return remote.results.map(remoteToResult);
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
