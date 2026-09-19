/** The hybrid-search wire model (§9).
 *
 *  Every type here crosses `v1.search.query`, and the same classes are
 *  `bible egw search --json`'s codec — one shared codec per payload, exactly as
 *  `LookupResultJson` and `WikiPageJson` are, so the RPC response and the CLI's
 *  JSON are one value encoded by one schema rather than two projections that
 *  drift.
 *
 *  Two shapes this module exists to enforce:
 *
 *  1. **§9.4's pinned topics group.** `topics` is a field beside `paragraphs`,
 *     never an entry inside it. A topic page and a paragraph are different kinds
 *     of answer, and a client that had to filter one out of a mixed list is a
 *     client that will eventually rank them together.
 *  2. **§9.6's typed absence.** `vector` carries why the vector leg did not run,
 *     as the same value in all three clients. A silent quality drop and a
 *     host-specific branch are the two failure modes it exists to prevent.
 */

import { Option, Schema } from 'effect';

import { WritingsBookCode } from '../writings/book-code.js';
import { CorpusScope } from '../writings/corpus-scope.js';
import { CorpusFilterSchema, NO_FILTER, type CorpusFilter } from '../writings/corpus-class.js';
import { TopicSlug, TopicStatus } from '../wiki/model.js';

// ---------------------------------------------------------------------------
// The query and its route (§9.3)
// ---------------------------------------------------------------------------

/** How the router read the query (§9.3's table, as a value on the result).
 *
 *  On the result rather than inferred by each client from the query text: the
 *  routing rules are core's, the three surfaces render the route differently
 *  ("exact phrase", "jumped to GC 425"), and a client that re-derived the route
 *  from the raw string would be a second implementation of §9.3.
 *
 *  `phrase` — a quoted string: exact phrase, lexical only.
 *  `locate` — a refcode pattern: the locate-jump.
 *  `hybrid` — everything else: lexical, plus the vector leg when §9.3's two
 *  conditions hold.
 */
export const SearchRoute = Schema.Literals(['phrase', 'locate', 'hybrid']);
export type SearchRoute = typeof SearchRoute.Type;

/** Why the vector leg did not contribute to this result (§9.6).
 *
 *  A closed union rather than a boolean, because the four reasons call for four
 *  different things from the reader: `absent` is an install away, `fingerprint`
 *  is an app update away, `embedder` is a capability the host lacks, and
 *  `short-circuit` is the engine working as designed. Collapsing them to
 *  "degraded" would tell a reader on a no-WebGPU browser the same thing it tells
 *  a reader whose index is simply not downloaded yet.
 *
 *  `short-circuit` is here rather than modelled apart because §9.6 asks for one
 *  question — did the vector leg run, and if not, why — and a client rendering
 *  two absence channels would have to decide which one wins.
 */
export const VectorAbsenceReason = Schema.Literals([
  /** No vector artifact is installed on this host. */
  'absent',
  /** An artifact is installed, but its model fingerprint is not the one this
   *  build embeds queries with, so its neighbors would be meaningless. */
  'fingerprint',
  /** No query embedder is available: no WebGPU on web, or no model files where
   *  a native adapter was configured to find them. */
  'embedder',
  /** §9.3's strong-BM25 short-circuit fired: the lexical top hit was strong and
   *  clearly separated, so the vector leg was deliberately skipped. */
  'short-circuit',
  /** The route was `phrase` or `locate`, which §9.3 makes lexical-only. */
  'route',
]);
export type VectorAbsenceReason = typeof VectorAbsenceReason.Type;

/** §9.6's typed absence, or its negation.
 *
 *  A tagged pair rather than `Option<reason>` because "the vector leg ran" is
 *  itself information a client shows — the result carries semantic neighbors —
 *  and `None` reads as "no reason" rather than "no absence". The `ran` case
 *  carries the fingerprint it ran under so a client can say which model
 *  produced the neighbors it is looking at.
 */
export class VectorLegRan extends Schema.TaggedClass<VectorLegRan>('Search/VectorLegRan')('ran', {
  fingerprint: Schema.NonEmptyString,
  /** How many paragraphs the scan considered. */
  scanned: Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
}) {}

export class VectorIndexUnavailable extends Schema.TaggedClass<VectorIndexUnavailable>(
  'Search/VectorIndexUnavailable',
)('unavailable', {
  reason: VectorAbsenceReason,
}) {}

export const VectorLegStatus = Schema.Union([VectorLegRan, VectorIndexUnavailable]);
export type VectorLegStatus = typeof VectorLegStatus.Type;

/** The one constructor for §9.6's absence, so every producer spells it the
 *  same way and a grep for the reason finds one site per reason. */
export const vectorUnavailable = (reason: VectorAbsenceReason): VectorIndexUnavailable =>
  VectorIndexUnavailable.make({ reason });

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** One paragraph the search found, with the provenance of *how* it was found.
 *
 *  `lexical` and `vector` are the two source ranks that produced this row, each
 *  `Option` because a hit can come from either list or both. They are carried
 *  rather than discarded because the fusion score alone cannot tell a reader
 *  (or a test) whether a row is here because the words matched or because the
 *  meaning did — which is the whole observable difference hybrid search makes.
 */
export class SearchParagraphHit extends Schema.Class<SearchParagraphHit>('Search/ParagraphHit')({
  /** The stable paragraph identity the vector index joins on. */
  paragraphId: Schema.NonEmptyString,
  /** The publication's numeric id, which is what the reader route addresses a
   *  writings paragraph by: `/writings/<publicationId>/p/<rawParaId>`.
   *
   *  Carried on the hit rather than derived by each client, because it cannot
   *  be derived at all — `bookCode` is a code (`GC`, `DA`), not a number, and
   *  the app's route decoder requires a positive integer in that segment. The
   *  UI built links out of `bookCode` and `paragraphId` and produced a path no
   *  decoder accepts, so every result link 404'd (round-2 B2). Three clients
   *  render these hits; putting the route's own inputs on the wire is what
   *  keeps them from each inventing a different broken path. */
  publicationId: Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1))),
  /** The corpus's own `para_id`, unqualified — the second half of the route.
   *
   *  Absent for a paragraph the corpus stores without one, which is exactly the
   *  set of paragraphs that have no addressable route; a client draws those
   *  without a link rather than with a broken one. */
  rawParaId: Schema.Option(Schema.NonEmptyString),
  refcode: Schema.NonEmptyString,
  bookCode: Schema.NonEmptyString,
  bookTitle: Schema.NonEmptyString,
  author: Schema.NonEmptyString,
  snippet: Schema.String,
  /** The RRF score this row fused to, §9.4's k=60 formula. */
  score: Schema.Finite,
  /** 1-based rank in the lexical list, absent when only the vector leg found it. */
  lexicalRank: Schema.Option(
    Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1))),
  ),
  /** 1-based rank in the vector list, absent when only the lexical leg found it. */
  vectorRank: Schema.Option(
    Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1))),
  ),
}) {}

/** One topic page the query names — §9.4's pinned group.
 *
 *  The same three fields `LookupCatalogMatch` carries, and deliberately not that
 *  class: a lookup match answers "what did this selection mean", a search topic
 *  answers "which page is this query about", and the two surfaces cap and order
 *  them differently. Sharing the class would tie §7's panel to §9's result page.
 */
export class SearchTopicHit extends Schema.Class<SearchTopicHit>('Search/TopicHit')({
  slug: TopicSlug,
  title: Schema.NonEmptyString,
  status: TopicStatus,
}) {}

/** Where a `locate` route landed (§9.3's locate-jump).
 *
 *  `Option`-shaped on the result rather than a fourth route: a refcode that
 *  matches the *pattern* but names nothing in the library is still a `locate`
 *  query — the router read it correctly — and the honest answer is the route
 *  plus no destination, not a re-route to hybrid behind the reader's back.
 */
export class SearchLocateTarget extends Schema.Class<SearchLocateTarget>('Search/LocateTarget')({
  refcode: Schema.NonEmptyString,
  bookCode: Schema.NonEmptyString,
  bookTitle: Schema.NonEmptyString,
  paragraphId: Schema.NonEmptyString,
  /** The two route inputs, for the same reason `SearchParagraphHit` carries
   *  them: the jump target is a *link*, and `/writings/<publicationId>/p/<id>`
   *  is the only shape the app decodes (round-2 B2). */
  publicationId: Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1))),
  rawParaId: Schema.Option(Schema.NonEmptyString),
}) {}

/** The whole answer to one query (§9).
 *
 *  Field order is render order: the pinned topics group, then the located
 *  paragraph if the route found one, then the fused paragraph ranking. Like
 *  §7's five groups, every field is present and no field is optional — an empty
 *  `topics` is present-and-empty, so the three clients cannot disagree about
 *  whether the group exists this time.
 */
export class SearchResult extends Schema.Class<SearchResult>('Search/Result')({
  /** The query as it was asked, echoed so an async client can tell which
   *  request a result belongs to. */
  query: Schema.NonEmptyString,
  route: SearchRoute,
  scope: CorpusScope,
  /** §9.4's pinned group. Above `paragraphs`, never inside it. */
  topics: Schema.Array(SearchTopicHit),
  locate: Schema.Option(SearchLocateTarget),
  paragraphs: Schema.Array(SearchParagraphHit),
  /** §9.6's typed absence, or the fingerprint the vector leg ran under. */
  vector: VectorLegStatus,
}) {}

/** The one wire encoding of a search result, shared by `v1.search.query`'s
 *  success schema and `bible egw search --json`, named for the same reason
 *  `LookupResultJson` is: neither surface enumerates fields, and a field added
 *  to `SearchResult` reaches both at once. */
export const SearchResultJson = SearchResult;
export type SearchResultJson = typeof SearchResultJson.Encoded;

/** How many paragraph rows one search answers with.
 *
 *  A results-page cap rather than §7's glance cap, which is why it is 20 rather
 *  than `LOOKUP_HIT_LIMIT`'s 8: this surface is the thing the reader came for,
 *  not one group among five. */
export const SEARCH_HIT_LIMIT = 20;

/** How many topic pages the pinned group carries.
 *
 *  Small for §7's reason: a pinned group is an identity answer, and a column of
 *  twelve candidate topics above the results is not pinning anything. */
export const SEARCH_TOPIC_LIMIT = 5;

/** How many rows each leg contributes to the fusion before it is cut.
 *
 *  Larger than `SEARCH_HIT_LIMIT` because fusion is the point: a row ranked 24th
 *  lexically and 3rd by vector belongs in the top 20 of the fused list, and a
 *  leg truncated at 20 could never propose it. qmd's 30 is what §9.4's "no
 *  cross-encoder rerank over 30 candidates" sizes its budget against. */
export const SEARCH_CANDIDATE_LIMIT = 30;

/** The default corpus scope for a search.
 *
 *  `egw` rather than `all`, because §9.2 pins the vector index to exactly the
 *  EGW/White-Estate partition: outside it the hybrid half of hybrid search
 *  cannot contribute, and a default that silently ran lexical-only would make
 *  the milestone's headline behavior opt-in. A reader who wants the pioneers
 *  asks for them. */
export const SEARCH_DEFAULT_SCOPE: CorpusScope = 'egw';

/** What a caller asks for. Scope and book are the two narrowings §10's UI
 *  parity shares through URL state; `limit` is the client's page size. */
export class SearchQuery extends Schema.Class<SearchQuery>('Search/Query')({
  text: Schema.NonEmptyString,
  scope: Schema.Option(CorpusScope),
  bookCode: Schema.Option(WritingsBookCode),
  /** The library-classification filters (section, type, subtype, apparatus).
   *
   *  Optional with a `NO_FILTER` default rather than an `Option`: every
   *  existing caller constructs a `SearchQuery` without it, and an absent
   *  filter and an empty filter mean exactly the same thing to the SQL below —
   *  so there is nothing for a `None` to distinguish. */
  filter: Schema.optionalKey(CorpusFilterSchema),
  limit: Schema.Option(
    Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1))),
  ),
}) {}

/** The scope a query runs under, with the default applied once.
 *
 *  Here rather than at each of the three call sites, so the CLI, the RPC handler
 *  and the UI cannot disagree about what an unspecified scope means. */
export const queryScope = (query: SearchQuery): CorpusScope =>
  Option.getOrElse(query.scope, () => SEARCH_DEFAULT_SCOPE);

export const queryLimit = (query: SearchQuery): number =>
  Option.getOrElse(query.limit, () => SEARCH_HIT_LIMIT);

/** The classification filters a query runs under, with the default applied
 *  once — the `queryScope` pattern, for the same reason. */
export const queryFilter = (query: SearchQuery): CorpusFilter => query.filter ?? NO_FILTER;
