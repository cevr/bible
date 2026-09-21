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

import {
  BookSubtype,
  BookType,
  CorpusScope,
  CorpusSection,
  EXCLUDE_PREFIX,
  isBookSubtype,
  isBookType,
  isCorpusScope,
  isCorpusSection,
  NO_SELECTION,
  SELECTABLE_SUBTYPES,
  SignedFromStrings,
} from '@bible/core/writings';

/** Re-exported through the API module so the browser bundle has one import for
 *  the whole wire vocabulary — the schemas it decodes with and the guards it
 *  parses URL parameters with come from the same place the endpoints below are
 *  declared, rather than the client reaching into `@bible/core` separately and
 *  risking a second, divergent copy. */
export {
  BookSubtype,
  BookType,
  CorpusScope,
  CorpusSection,
  EXCLUDE_PREFIX,
  isBookSubtype,
  isBookType,
  isCorpusScope,
  isCorpusSection,
  NO_SELECTION,
  SELECTABLE_SUBTYPES,
  SignedFromStrings,
};

/** One paragraph of context around a hit.
 *
 *  `before` and `after` are separate arrays rather than one window with the
 *  hit inside it, because the client renders the hit differently from its
 *  neighbours and a flat window would make it re-find which row was the
 *  match. */
/** The deep link egwwritings.org expects. The corpus's `para_id` is exactly
 *  the panel id the reader addresses.
 *
 *  Lives here rather than in `main.ts` because both the hit and its context
 *  paragraphs are addressed the same way, and the two builders should not
 *  drift apart. */
export const readerUrl = (paragraphId: string): string =>
  `https://egwwritings.org/read?panels=p${encodeURIComponent(paragraphId)}&index=0`;

export const ContextParagraphSchema = S.Struct({
  refcode: S.NullOr(S.String),
  text: S.String,
  /** The egwwritings.org deep link for this paragraph, so a neighbour can be
   *  opened in its own setting exactly as the match can. Null for a paragraph
   *  the corpus stores without a `para_id`. */
  url: S.NullOr(S.String),
  /** Whether this neighbour is a chapter or section heading.
   *
   *  What makes progressive disclosure stop in the right place: expanding
   *  context past a heading walks into a different chapter, where the
   *  surrounding sentences no longer explain the hit. The client uses it to
   *  decide whether an expand control belongs on that side at all. */
  isHeading: S.Boolean,
});
export type ContextParagraph = S.Schema.Type<typeof ContextParagraphSchema>;

/** One search hit.
 *
 *  `lexicalRank` and `vectorRank` are how a reader can tell whether a row is
 *  here because the words matched or because the meaning did — the observable
 *  difference hybrid search makes. Either is null when only one leg found it.
 */
export const SearchHitSchema = S.Struct({
  /** Null for a paragraph the corpus stores without a citation — the same set
   *  `ContextParagraphSchema` above already allowed a null refcode for. A hit
   *  and a neighbour are the same kind of row, so requiring one here and not
   *  there was the asymmetry that made `controversy` a 500. */
  refcode: S.NullOr(S.String),
  bookCode: S.String,
  bookTitle: S.String,
  author: S.String,
  text: S.String,
  /** Whether this hit is a chapter or section heading rather than prose — see
   *  `SearchParagraphHit.isHeading`. A heading and a sentence are otherwise the
   *  same shape on the wire, so without this the client cannot tell the chapter
   *  title "The Loud Cry" from the phrase written mid-paragraph. */
  isHeading: S.Boolean,
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
  /** The scope this page was actually retrieved in. Echoed rather than assumed
   *  by the client, so a result set always states which corpus produced it. */
  scope: CorpusScope,
  /** `'hybrid'` when the vector leg ran; `'lexical — <reason>'` carrying
   *  §9.6's typed absence when it did not. Search degrades, but never
   *  silently. */
  vector: S.String,
  /** Whether the query matched too much of the corpus to rank, so `hits` is
   *  empty by decision rather than because nothing matched. The two states read
   *  identically on the wire otherwise, and they want opposite words on screen. */
  nonSelective: S.Boolean,
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
        /** Whose books the search may reach. Server-side rather than a filter
         *  the client applies to a returned page: §9.2 pins the vector index to
         *  the EGW/White-Estate partition, so on a hybrid query the fusion
         *  ranks EGW candidates above pioneer ones and a page of 40 hits comes
         *  back EGW-only. Filtering *that* page for pioneers yields nothing.
         *  Narrowing the query re-runs retrieval in the chosen scope, which is
         *  the only way the pioneer material surfaces at all. */
        scope: S.optional(CorpusScope),
        /** The library's own classification axes, each a repeated key
         *  (`?type=book&type=periodical`). Server-side for the same reason
         *  `scope` is: narrowing has to happen before retrieval ranks, not
         *  after it returns a page.
         *
         *  `SignedFromStrings` rather than the union itself because each value
         *  carries its own sign: `?subtype=commentary&subtype=-devotional`
         *  means "commentaries, but no devotionals". The transform is on the
         *  endpoint, so the handler receives `{ include, exclude }` already
         *  split — there is no parse step to forget. Unknown values are
         *  dropped, so a hand-edited link degrades to a weaker filter instead
         *  of a failed request. */
        section: S.optional(SignedFromStrings(CorpusSection)),
        type: S.optional(SignedFromStrings(BookType)),
        subtype: S.optional(SignedFromStrings(BookSubtype)),
        /** Drop dictionaries, concordances and scripture indexes — 39% of the
         *  corpus, and lookup apparatus rather than anything read through. */
        noref: S.optional(S.String),
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
