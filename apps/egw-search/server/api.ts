/**
 * The search API definition.
 *
 * One group, two endpoints. It is an `HttpApi` rather than a hand-rolled
 * `Bun.serve` router so request decoding, response encoding and error mapping
 * are all derived from the schemas below instead of written by hand — and so
 * the handler is an ordinary Effect with its services in context, rather than
 * something that has to close over a captured runtime.
 */

import { Schema as S } from 'effect';
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from 'effect/unstable/httpapi';

/** One paragraph of context around a hit.
 *
 *  `before` and `after` are separate arrays rather than one window with the
 *  hit inside it, because the client renders the hit differently from its
 *  neighbours and a flat window would make it re-find which row was the
 *  match. */
export const ContextParagraphSchema = S.Struct({
  refcode: S.NullOr(S.String),
  text: S.String,
});
export type ContextParagraph = S.Schema.Type<typeof ContextParagraphSchema>;

/** One search hit.
 *
 *  `lexicalRank` and `vectorRank` are how a reader can tell whether a row is
 *  here because the words matched or because the meaning did — the observable
 *  difference hybrid search makes. Either is null when only one leg found it.
 */
export const SearchHitSchema = S.Struct({
  refcode: S.String,
  bookCode: S.String,
  bookTitle: S.String,
  author: S.String,
  text: S.String,
  lexicalRank: S.NullOr(S.Finite),
  vectorRank: S.NullOr(S.Finite),
  /** The egwwritings.org deep link, null for a paragraph the corpus stores
   *  with no `para_id` — exactly the set that has no addressable route. */
  url: S.NullOr(S.String),
  before: S.Array(ContextParagraphSchema),
  after: S.Array(ContextParagraphSchema),
});
export type SearchHitWire = S.Schema.Type<typeof SearchHitSchema>;

export const SearchResponseSchema = S.Struct({
  hits: S.Array(SearchHitSchema),
  topics: S.Array(S.String),
  /** `'hybrid'` when the vector leg ran; `'lexical — <reason>'` carrying
   *  §9.6's typed absence when it did not. Search degrades, but never
   *  silently. */
  vector: S.String,
});
export type SearchResponse = S.Schema.Type<typeof SearchResponseSchema>;

export class SearchFailed extends S.TaggedError<SearchFailed>()(
  'SearchFailed',
  { message: S.String },
  { httpApiStatus: 500 },
) {}

export const SearchGroup = HttpApiGroup.make('search')
  .add(
    HttpApiEndpoint.get('query', '/api/search', {
      query: {
        q: S.String,
        limit: S.optional(S.FiniteFromString),
        context: S.optional(S.FiniteFromString),
      },
      success: SearchResponseSchema,
      error: [SearchFailed],
    }),
  )
  .add(
    HttpApiEndpoint.get('health', '/health', {
      success: S.Struct({ ok: S.Boolean }),
    }),
  );

export class SearchApi extends HttpApi.make('EGWSearch').add(SearchGroup) {}
