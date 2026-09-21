/** §9's hybrid search, composed.
 *
 *  The router (§9.3) picks a route; the lexical leg always runs (§9.3: "always
 *  lexical"); the vector leg runs only when the route, the query shape, the
 *  index and the embedder all allow it; and RRF (§9.4) fuses what came back.
 *
 *  **Retrieval over the writings, and nothing else.** A pinned group of wiki
 *  topic pages used to be fetched here on every query, which made a topics
 *  artifact a dependency of searching the corpus. It is an application's
 *  concern now — see `SearchResult`.
 *
 *  **No new data layer.** Every read is a call an existing service already
 *  exposes — `WritingsService.searchScored`, `EGWParagraphDatabase
 *  .findByRefcodeShort` — exactly as `LookupService` composes §7 and
 *  `composeSections` composes §6. What was missing was the seam that routes one
 *  string across two retrieval strategies, and this is only that seam.
 *
 *  **The effect does not fail.** Search degrades: an absent index is
 *  lexical-only, an absent embedder is lexical-only. What it does *not* do is
 *  degrade silently — every degradation of the vector leg is reported as §9.6's
 *  typed absence on the result, and the same value reaches all three clients.
 */

import { Array as Arr, Context, Effect, Layer, Option, Stream } from 'effect';

import { nodesToText } from '../egw/ast.js';
import {
  bookMatchesFilter,
  ftsTermQuery,
  paragraphIdentity,
  type EGWParagraphDatabaseService,
  type ScoredParagraphRow,
} from '../egw-db/book-database.js';
import type { CorpusScope } from '../writings/corpus-scope.js';
import type { CorpusFilter } from '../writings/corpus-class.js';
import { QueryEmbedder, type QueryEmbedderApi } from './embedder.js';
import { fuse, ORIGINAL_QUERY_WEIGHT, type FusionList } from './fusion.js';
import {
  queryFilter,
  queryLimit,
  queryScope,
  candidateLimit,
  SearchLocateTarget,
  SearchParagraphHit,
  SearchResult,
  vectorUnavailable,
  VectorLegRan,
  type SearchQuery,
  type VectorLegStatus,
} from './model.js';
import { route, type RoutedQuery } from './router.js';
import {
  loadVectorIndex,
  ResolvedVectorIndex,
  VectorIndexBytes,
  type LoadedVectorIndex,
} from './vector-artifact.js';
import { primeVectorAccel, readyVectorAccel } from './vector-accel.js';
import { scanVectorIndex, type VectorIndex } from './vector-index.js';

export interface SearchServiceApi {
  /** One query, answered whole (§9). Never fails: every source degrades, and
   *  every degradation of the vector leg is on the result as §9.6's typed
   *  absence. */
  readonly query: (input: SearchQuery) => Effect.Effect<SearchResult>;
}

// ---------------------------------------------------------------------------
// The strong-BM25 short-circuit (§9.3)
// ---------------------------------------------------------------------------

/** How strong the **normalized** lexical top hit must be for the short-circuit
 *  to fire.
 *
 *  qmd's `STRONG_SIGNAL_MIN_SCORE` (`store.ts` ~415), unchanged. §9.3 takes its
 *  short-circuit from qmd, and qmd's two thresholds are stated over *normalized*
 *  scores in [0, 1] — `topScore >= 0.85 && (topScore - secondScore) >= 0.15`
 *  (~5435). The earlier implementation kept the shape and replaced the numbers
 *  with thresholds over raw `-rank`, which is a different predicate over a
 *  different quantity: BM25 magnitudes are unbounded and corpus-relative, so a
 *  fixed floor of 9.0 fires on whatever the corpus happens to score above 9 and
 *  a ratio of 1.5 means one thing on a two-word query and another on a six-word
 *  one. Measured against the live corpus the substituted predicate fired where
 *  qmd's did not.
 */
export const STRONG_SIGNAL_MIN_SCORE = 0.85;

/** How far clear of the runner-up that normalized top hit must be.
 *
 *  qmd's `STRONG_SIGNAL_MIN_GAP`. §9.3 asks for two conditions, not one —
 *  "strong **and clearly separated**" — because either alone misfires. A strong
 *  top hit in a field of equally strong hits means the query matched a common
 *  formula and the reader needs the ranking help embeddings give; a
 *  well-separated top hit that is weak in absolute terms means everything
 *  matched badly and the leader is noise.
 *
 *  A **difference** rather than a ratio, because the scores it reads are
 *  normalized: on [0, 1] a gap of 0.15 is the same distance everywhere, which is
 *  the property a ratio over unbounded BM25 was trying and failing to buy.
 */
export const STRONG_SIGNAL_MIN_GAP = 0.15;

/** One FTS5 rank, as the [0, 1) score qmd's predicate is written over.
 *
 *  `|bm25| / (1 + |bm25|)`, which is qmd's own conversion in `searchFTS`
 *  (`store.ts` ~4066) together with its reason: *"Monotonic and
 *  **query-independent** — no per-query normalization needed."*
 *
 *  That property is the whole point, and it is what a per-query normalization
 *  would destroy. Min-max over the candidate list looks like the obvious way to
 *  reach [0, 1] and is wrong here: it puts the top hit at exactly 1 on *every*
 *  query, which makes the 0.85 floor unreachable-from-below and reduces the
 *  predicate to the gap alone. A saturating map keeps the absolute threshold
 *  meaningful — 0.85 is exactly `|bm25| >= 5.667`, a real strength — while
 *  staying bounded so the 0.15 gap is the same distance on every query.
 *
 *  qmd's own scale comments: strong(-10) → 0.91, medium(-2) → 0.67,
 *  weak(-0.5) → 0.33, none(0) → 0.
 *
 *  Takes the already-flipped positive score (`-rank`), so the absolute value is
 *  a no-op for a well-formed input and a guard for a caller that passed FTS5's
 *  negative value straight through.
 */
export const normalizeScore = (score: number): number => {
  const magnitude = Math.abs(score);
  return magnitude / (1 + magnitude);
};

/** §9.3's short-circuit, as qmd's predicate over the lexical leg's scores.
 *
 *  A pure function of the scores, so §10's "skips the vector leg on a confident
 *  lexical top hit" is a claim a test states directly rather than inferring from
 *  whether an embedder was called.
 *
 *  Takes raw `-rank` values and normalizes here, rather than asking the caller
 *  to normalize: the normalization is half the predicate, and a caller that
 *  passed raw scores to a predicate expecting normalized ones would get a
 *  short-circuit that fires on the corpus's scale instead of on the query's
 *  separation — which is exactly the bug this replaces.
 */
export const isStrongLexicalHit = (scores: readonly number[]): boolean =>
  Option.match(Arr.get(scores, 0), {
    onNone: () => false,
    onSome: (rawTop) => {
      const top = normalizeScore(rawTop);
      if (top < STRONG_SIGNAL_MIN_SCORE) return false;
      return Option.match(Arr.get(scores, 1), {
        onNone: () => true,
        onSome: (rawRunnerUp) => top - normalizeScore(rawRunnerUp) >= STRONG_SIGNAL_MIN_GAP,
      });
    },
  });

// ---------------------------------------------------------------------------
// What the service reads
// ---------------------------------------------------------------------------

/** One paragraph as both legs identify it, and as the result renders it.
 *
 *  `paragraphId` is the join key §9.2 gives the vector index, and it is the id
 *  the fusion ranks: the two legs return different row shapes over the same
 *  corpus, and fusing them requires one identity both agree on.
 */
export interface SearchParagraphRow {
  readonly paragraphId: string;
  /** The route's own inputs, carried from the row rather than derived — see
   *  `SearchParagraphHit.publicationId` (round-2 B2). */
  readonly publicationId: number;
  readonly rawParaId: Option.Option<string>;
  /** Absent for a paragraph the corpus stores with neither a short refcode nor
   *  a `ref_code` — see `SearchParagraphHit.refcode` for why those rows exist
   *  and why dropping them would be the wrong repair. */
  readonly refcode: Option.Option<string>;
  readonly bookCode: string;
  readonly bookTitle: string;
  readonly author: string;
  readonly snippet: string;
  /** A chapter or section heading rather than prose — see
   *  `ScoredParagraphRow.isHeading` for why BM25 floods a result page with
   *  these and why the surface has to be able to say so. */
  readonly isHeading: boolean;
  /** FTS5's `-rank`, positive and larger-is-better. Absent for a row the vector
   *  leg found and the lexical leg did not. */
  readonly score: number;
}

/** The corpus one search reads, bundled the way `SectionSources` is.
 *
 *  One rather than two: hybrid search is over `paragraphs_fts` and nothing
 *  else. A wiki used to be the second, which made topic pages a dependency of
 *  searching the writings — see `SearchResult`. Still a bundle rather than the
 *  bare service, so a host wires it once and a host that wires nothing says so
 *  with `NotWired` rather than by omission.
 */
export interface SearchSources {
  readonly paragraphs: EGWParagraphDatabaseService;
}

export type SearchSourcing =
  | { readonly _tag: 'wired'; readonly sources: SearchSources }
  | { readonly _tag: 'not-wired' };

export class SearchCorpusSources extends Context.Service<SearchCorpusSources, SearchSourcing>()(
  '@bible/core/search/SearchCorpusSources',
) {
  /** A host that deliberately serves no searchable corpus. A written decision,
   *  not an omitted dependency — the distinction `WikiSectionSources` draws for
   *  the same reason. */
  static NotWired: Layer.Layer<SearchCorpusSources> = Layer.succeed(
    SearchCorpusSources,
    SearchCorpusSources.of({
      _tag: 'not-wired',
    }),
  );

  static wired = (sources: SearchSources): Layer.Layer<SearchCorpusSources> =>
    Layer.succeed(SearchCorpusSources, SearchCorpusSources.of({ _tag: 'wired', sources }));
}

// ---------------------------------------------------------------------------
// The legs
// ---------------------------------------------------------------------------

/** FTS5 syntax for the query the router produced.
 *
 *  A `phrase` route becomes a quoted FTS phrase, which is what makes "exact
 *  phrase" exact. Everything else is passed as a bare term list with FTS's own
 *  operators escaped — a reader typing `probation "close"` or `NEAR/3` is
 *  searching for words, not writing a query language, and §9.3 is explicit that
 *  the router adds "no new syntax".
 */
const ftsQuery = (routed: RoutedQuery): string => {
  if (routed._tag === 'phrase') return `"${routed.phrase.replace(/"/gu, '""')}"`;
  if (routed._tag === 'locate') return `"${routed.refcode.replace(/"/gu, '""')}"`;
  // The term tokenizer moved to `egw-db` so `WritingsService.search` could
  // apply the identical rule (it could not, and crashed on reader punctuation).
  // Quoting, the `FTS_TERM_CONJUNCTION` join and the empty-result case all live
  // there now; an all-punctuation query still becomes `""`, which matches
  // nothing rather than erroring.
  return Option.getOrElse(ftsTermQuery(routed.text), () => '""');
};

/** One scored row, as the pipeline reads it.
 *
 *  `paragraphId` comes straight from `ScoredParagraphRow.para_id`, which is
 *  `paragraphIdentity(bookCode, para_id)` — the one spelling the DB composes,
 *  the compiler writes into the manifest, and the batch lookup matches on. There
 *  is deliberately no key function here any more: a second definition beside the
 *  first is how the reader and the writer come to disagree, and a search whose
 *  two legs key paragraphs differently silently never fuses anything.
 */
/** Whether a corpus string is actually there.
 *
 *  The corpus spells "no refcode" two ways — SQL NULL and `''` — and only the
 *  first survives as an `Option`. This is what collapses them. */
const isNonEmpty = (value: string): boolean => value.length > 0;

const toRow = (row: ScoredParagraphRow): SearchParagraphRow => ({
  paragraphId: row.para_id,
  publicationId: row.publicationId,
  rawParaId: row.rawParaId,
  // The short refcode, else `ref_code`, else absent — and empty counts as
  // absent at both steps. `refcode_short` is an Option over SQLite NULL, so it
  // can be `Some('')` (549 rows), and `ref_code` is NOT NULL yet `''` for 563.
  // A null check alone would let an empty string through to a `NonEmptyString`
  // and die, which is exactly the bug this replaces.
  refcode: Option.orElse(Option.filter(row.refcode_short, isNonEmpty), () =>
    Option.filter(Option.some(row.ref_code), isNonEmpty),
  ),
  bookCode: row.bookCode,
  bookTitle: row.bookTitle,
  author: row.bookAuthor,
  snippet: nodesToText(row.nodes),
  isHeading: row.isHeading,
  // FTS5 rank is negative and better-is-lower; the whole pipeline below wants
  // larger-is-better, and flipping it once here is what keeps the threshold
  // constants readable.
  score: -row.rank,
});

/** How many matches make a term too common to be worth ranking.
 *
 *  **Measured, not guessed.** `ORDER BY rank` scores *every* match to return
 *  sixty rows, and the cost is linear in the match count at ~1.3 µs each on the
 *  deployed corpus:
 *
 *  | term          | matches   | % corpus | `ORDER BY rank` |
 *  |---------------|-----------|----------|-----------------|
 *  | `the`         | 1,621,088 | 53.8%    | 2,129 ms        |
 *  | `a`           |   940,692 | 31.2%    | 1,124 ms        |
 *  | `that`        |   860,411 | 28.6%    | 1,009 ms        |
 *  | `is`          |   775,189 | 25.7%    |   920 ms        |
 *  | `god`         |   570,900 | 19.0%    |   653 ms        |
 *  | `lord`        |   299,913 | 10.0%    |   340 ms        |
 *  | `sabbath`     |    68,411 |  2.3%    |    82 ms        |
 *  | `sanctuary`   |    16,765 |  0.6%    |    20 ms        |
 *  | `latter rain` |     1,304 |  0.04%   |     2 ms        |
 *
 *  750,000 — about a quarter of the corpus — because that is where a term stops
 *  discriminating. The ranking a stopword buys is a *term-density artifact*,
 *  not an answer: the top hit for `the` is a paragraph that repeats the word,
 *  scored `-0.000`, and for `god` it is an index entry ("See also God,
 *  acquaintance with"). Two seconds of BM25 to choose sixty rows that mean
 *  nothing.
 *
 *  It sits above `god` (19.0%) and `lord` (10.0%) deliberately. Both are real
 *  one-word searches in this corpus, and a threshold low enough to catch them
 *  would trade a working query for a latency number. Only genuine stopwords are
 *  gated.
 *
 *  **The latencies in the table above are stale and the exemption is now
 *  inverted.** This comment used to justify itself by saying `god` and `lord`
 *  "already answer inside 700 ms". Measured warm in production 2026-09-21:
 *  `god` 1.29 s, `lord` 0.78 s, `sabbath` 0.63 s — while `the`, which the gate
 *  refuses to rank, answers in 0.33 s. The gated stopword is now the *fastest*
 *  one-word query and the exempted real term is the *slowest*. The premise
 *  moved; the reasoning did not. Lowering the threshold is still the wrong
 *  repair, because it buys the latency number by deleting the query — the fix
 *  is to make ranking 570,900 rows cheaper, which is open work. Do not quote
 *  the millisecond figures above as current.
 *
 *  Absolute rather than a fraction of the corpus: a ratio needs the row count,
 *  which is a second query on every search, and the point of the gate is to be
 *  cheaper than the work it avoids. */
export const NON_SELECTIVE_MATCHES = 750_000;

/** Whether a term matches too much of the corpus to be worth ranking.
 *
 *  A named predicate rather than an inline comparison so the rule can be
 *  asserted without standing up a 750,000-row corpus: the fixture corpora are
 *  tiny by design, and a test that had to *reach* the threshold through the
 *  search service would be testing SQLite rather than the decision. */
export const isNonSelective = (matches: number): boolean => matches > NON_SELECTIVE_MATCHES;

/** What the lexical leg answers: its rows, and whether it declined to rank.
 *
 *  A pair rather than a bare array because an empty array has two meanings —
 *  nothing matched, or the query matched too much to be worth ranking — and
 *  the reader is owed different words for each. */
interface LexicalLegResult {
  readonly rows: readonly SearchParagraphRow[];
  readonly nonSelective: boolean;
  /** How many paragraphs the query matched at all, from the gate's own count
   *  probe.
   *
   *  Carried out of the leg purely so `search.timing` can name the cost of a
   *  slow query. A latency investigation needs to know *which* query was
   *  expensive, and the obvious way to log that — the text the reader typed —
   *  widens the log surface to hold user input, which the HTTP log deliberately
   *  does not (`http.url` is recorded without its query string). The match
   *  count identifies the offender by the only property that explains the
   *  latency: `god` is slow because it matches 570,900 rows, and that number
   *  says so without recording what anyone searched for.
   *
   *  Zero when the leg degraded, which is honest: a failed probe counted
   *  nothing. */
  readonly matches: number;
}

/** The lexical leg (§9.3: "always lexical").
 *
 *  Runs on every route, including `locate`: a refcode query that also matches
 *  text is still worth showing results for, and §9.3's locate-jump is a
 *  *destination* added above the results rather than a replacement for them.
 *
 *  A count probe precedes the ranked statement so a stopword never reaches it.
 *  It is cheap for exactly the reason the ranked query is not: counting a
 *  posting list walks it, scoring one reads every document it names.
 *
 *  `estimateMatchCount` rather than `countSearchParagraphs` because the latter
 *  joins `paragraphs` and `books` to keep its count in step with the scoped
 *  results, and those joins cost 20-30x the bare count: 562 ms against 25 ms
 *  for `the`, and 45 ms against 1 ms for `sabbath`. Probing with it would have
 *  added half a second to every stopword and *half again* to the real queries
 *  it is supposed to leave alone — paying more for the gate than the gate
 *  saves. The bare count costs 25 ms where the ranking it avoids costs
 *  2,129 ms, and under 1 ms for the selective queries that are nearly all real
 *  traffic.
 *
 *  Ignoring scope is sound *for this decision*: a term in half the corpus is in
 *  half of any scope within it, so the estimate can only overcount, and the
 *  gate fires on terms that are non-selective by a factor of thousands. A count
 *  a reader is shown still comes from `countSearchParagraphs`.
 */
const lexicalLeg = (
  sources: SearchSources,
  routed: RoutedQuery,
  scope: CorpusScope,
  bookCode: Option.Option<string>,
  filter: CorpusFilter,
  candidates: number,
): Effect.Effect<LexicalLegResult> =>
  Effect.gen(function* () {
    const query = ftsQuery(routed);
    const options = {
      scope,
      bookCode: Option.getOrUndefined(bookCode),
      filter,
    };
    const matches = yield* sources.paragraphs.estimateMatchCount(query);
    if (isNonSelective(matches)) {
      yield* Effect.logInfo('search.lexical.non_selective').pipe(
        Effect.annotateLogs({ matches, threshold: NON_SELECTIVE_MATCHES }),
      );
      return { rows: [], nonSelective: true, matches };
    }
    const rows = yield* sources.paragraphs
      .searchScoredParagraphs(query, { ...options, limit: candidates })
      .pipe(Effect.map((scored) => scored.map(toRow)));
    return { rows, nonSelective: false, matches };
  }).pipe(
    // §6.5's posture, over the declared error only. It wraps the probe as well
    // as the ranked statement: a probe that fails degrades to no lexical rows,
    // exactly as a failing search does, rather than failing the whole query.
    Effect.catchTag(['SqlError', 'ParagraphDataIntegrityError'], (cause) =>
      Effect.logWarning('search.lexical.degraded').pipe(
        Effect.annotateLogs({ reason: String(cause) }),
        // A failure is not a non-selective query: the reader is owed "nothing
        // matched", not "your query was too common".
        Effect.as<LexicalLegResult>({ rows: [], nonSelective: false, matches: 0 }),
      ),
    ),
  );

/** The scan options for one query: how many neighbors, and over which books.
 *
 *  No `allow` at all means the whole index. A book filter narrows to one code;
 *  the `egw` scope needs no filter, because §9.2 pins the index to exactly the
 *  EGW/White-Estate partition — every vector in it is already in scope. A
 *  `pioneer` scope has no vectors by construction and never reaches here.
 */
const scanScope = (
  allow: Option.Option<ReadonlySet<string>>,
  candidates: number,
): { readonly topK: number; readonly allow?: ReadonlySet<string> } =>
  Option.match(allow, {
    onNone: () => ({ topK: candidates }),
    onSome: (codes) => ({ topK: candidates, allow: codes }),
  });

/** The vector leg, and every reason it might not run (§9.6).
 *
 *  The gates are in the order that costs least: the route and the wordiness
 *  check are free, the index read is a file read, and the embed is the ~100-400
 *  ms §9.5 measures. A query that fails an earlier gate never pays a later one —
 *  which is the whole point of §9.3's short-circuit sitting where it does.
 */
const vectorLeg = (
  deps: SearchDeps,
  routed: RoutedQuery,
  lexical: readonly SearchParagraphRow[],
  scope: CorpusScope,
  bookCode: Option.Option<string>,
  filter: CorpusFilter,
  candidates: number,
  sources: SearchSources,
): Effect.Effect<{ readonly ids: readonly string[]; readonly status: VectorLegStatus }> =>
  Effect.gen(function* () {
    // §9.3: quoted and refcode routes are lexical-only. A reader who quoted a
    // phrase asked for that phrase, and semantic neighbors would be the one
    // thing the quotes exist to refuse.
    if (routed._tag !== 'hybrid') {
      return { ids: [], status: vectorUnavailable('route') };
    }
    if (!routed.wordy) return { ids: [], status: vectorUnavailable('route') };
    // §9.2 pins the index to the EGW/White-Estate partition, so a pioneer-scoped
    // query has no vectors to scan. `absent` rather than a fifth reason: for
    // this query, in this scope, there is no index.
    if (scope === 'pioneer') return { ids: [], status: vectorUnavailable('absent') };
    // §9.3's short-circuit: a confident lexical top hit skips the embed
    // entirely. Before the index read, because a precise query should never
    // pay for the vector path at all.
    if (isStrongLexicalHit(lexical.map((row) => row.score))) {
      return { ids: [], status: vectorUnavailable('short-circuit') };
    }

    // Resolved once when the layer was built, not per query. Reading and
    // parsing here meant every wordy query re-read the 246 MB artifact from
    // disk and copied its vector region twice — the file adapter into a fresh
    // `ArrayBuffer`, then the parser into a fresh `Int8Array`.
    const loaded = deps.index;
    if (loaded._tag === 'unavailable') return { ids: [], status: loaded.absence };

    const embedder = deps.embedder;
    if (Option.isNone(embedder)) return { ids: [], status: vectorUnavailable('embedder') };
    // §10: "a model-fingerprint mismatch invalidates the vector leg rather than
    // returning wrong neighbors." The index and the embedder are installed and
    // wired independently, so this is where they are made to agree.
    if (embedder.value.fingerprint !== loaded.index.fingerprint) {
      return { ids: [], status: vectorUnavailable('fingerprint') };
    }

    // Which books the filter admits, resolved before the scan rather than
    // after it. See `allowedBookCodes`.
    const allow = yield* allowedBookCodes(sources, filter, bookCode);

    return yield* scanWith(embedder.value, loaded.index, routed.text, allow, candidates);
  });

/** The book codes a filter admits, as an `allow` set for the scan.
 *
 *  The lexical leg pushes its filter into a `WHERE` and never sees an excluded
 *  row. The vector leg had no equivalent: it scanned the whole flat buffer and
 *  the *next* step (`vectorOnlyBodies`) dropped the rows the reader had filtered
 *  out — so on the deployed corpus every wordy query scored 367,726 vectors
 *  whose results were then discarded. Measured on that corpus, resolving the
 *  set first takes the scan from 1078 ms to 523 ms.
 *
 *  `None` means "no narrowing", which the scan reads as one range over
 *  everything — cheaper than an allow set naming every book. A book filter is
 *  still the narrowest case and wins outright.
 *
 *  Degrades to `None` on a read failure: a filter that cannot be resolved must
 *  widen the scan, never silently narrow it. The post-scan filter in
 *  `vectorOnlyBodies` still holds, so correctness never depends on this. */
const allowedBookCodes = (
  sources: SearchSources,
  filter: CorpusFilter,
  bookCode: Option.Option<string>,
): Effect.Effect<Option.Option<ReadonlySet<string>>> => {
  if (Option.isSome(bookCode)) {
    return Effect.succeed(Option.some(new Set([bookCode.value])));
  }
  return Stream.runFold(
    sources.paragraphs.getAllBooks,
    () => new Set<string>(),
    (codes: Set<string>, book) => {
      if (bookMatchesFilter(book, filter)) codes.add(book.book_code);
      return codes;
    },
  ).pipe(
    Effect.map((codes) => Option.some<ReadonlySet<string>>(codes)),
    Effect.catchCause((cause) =>
      Effect.logWarning('search.vectorAllow.degraded').pipe(
        Effect.annotateLogs({ reason: String(cause) }),
        Effect.as(Option.none<ReadonlySet<string>>()),
      ),
    ),
  );
};

const scanWith = (
  embedder: QueryEmbedderApi,
  index: VectorIndex,
  text: string,
  allow: Option.Option<ReadonlySet<string>>,
  candidates: number,
): Effect.Effect<{ readonly ids: readonly string[]; readonly status: VectorLegStatus }> =>
  Effect.gen(function* () {
    // The two halves of `vectorMs`, separated. In production the leg swung
    // between 167 ms and 1034 ms with no way to tell which half moved: the
    // embed is a model forward pass and the scan is a linear walk over the
    // index, and they answer to completely different fixes. Logged rather than
    // spanned because the deployed host has no OTLP collector wired yet, so a
    // span would go nowhere.
    const embedAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
    const vector = yield* embedder.embedQuery(text);
    const scanAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
    // Whatever tier has finished loading by now; `None` until then.
    const accel = readyVectorAccel();
    const scan = scanVectorIndex(index, vector, {
      ...scanScope(allow, candidates),
      ...Option.match(accel, {
        onNone: () => ({}),
        onSome: (ready) => ({ scoreRange: ready.scoreRange }),
      }),
    });
    const doneAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
    yield* Effect.logInfo('search.vector.timing').pipe(
      Effect.annotateLogs({
        embedMs: scanAt - embedAt,
        scanMs: doneAt - scanAt,
        scanned: scan.scanned,
        // Which tier answered, so a deployment that silently lost its
        // accelerator is visible in the same line as the time it cost.
        accel: Option.match(accel, {
          onNone: () => 'js',
          onSome: (ready) => ready.kind,
        }),
      }),
    );
    return {
      ids: scan.neighbors.map((neighbor) => neighbor.paragraphId),
      status: VectorLegRan.make({
        fingerprint: index.fingerprint,
        // What the scan actually looked at, not the size of the index it
        // looked at part of. A book-narrowed query touches one range, and
        // reporting `index.count` for it told the reader the whole corpus had
        // been considered — see `VectorScan`.
        scanned: scan.scanned,
      }) satisfies VectorLegStatus,
    };
  }).pipe(
    // An adapter that declines at embed time — WebGPU lost, model file gone —
    // is §9.6's `embedder` absence, the same value a host with no adapter
    // reports. One reason for one reader-visible state.
    Effect.orElseSucceed(() => ({
      ids: [],
      status: vectorUnavailable('embedder') satisfies VectorLegStatus,
    })),
  );

/** §9.3's locate-jump: where a refcode query lands, when it lands anywhere.
 *
 *  `findByRefcodeShort` is the existing lookup the reader already reaches
 *  through `bible egw lookup`, so a refcode typed into the search box goes to
 *  the same paragraph it would have gone to before — which is what makes this a
 *  route rather than a feature.
 */
const locateTarget = (
  sources: SearchSources,
  refcode: string,
): Effect.Effect<Option.Option<SearchLocateTarget>> =>
  sources.paragraphs.findByRefcodeShort(refcode, 1).pipe(
    Effect.map((rows) =>
      Option.map(Option.fromNullishOr(rows[0]), (row) => {
        const found = Option.getOrElse(row.refcode_short, () => refcode);
        return SearchLocateTarget.make({
          refcode: found,
          bookCode: row.bookCode,
          bookTitle: row.bookTitle,
          // The route's inputs, from the row the lookup returned — the same two
          // values every paragraph hit carries, so a locate jump and a ranked
          // hit for the same paragraph build the identical link.
          publicationId: row.bookId,
          rawParaId: Option.filter(row.para_id, (value) => value.length > 0),
          // The same identity the two legs fuse on, from the same function —
          // so a refcode typed into the search box names the paragraph the
          // ranking would have named, and a client can highlight the located
          // row inside the results.
          paragraphId: paragraphIdentity(row.bookCode, row.para_id, found),
        });
      }),
    ),
    Effect.catchTag(['SqlError', 'ParagraphDataIntegrityError'], (cause) =>
      Effect.logWarning('search.locate.degraded').pipe(
        Effect.annotateLogs({ reason: String(cause) }),
        Effect.as(Option.none<SearchLocateTarget>()),
      ),
    ),
  );

/** The one fact worth logging about the vector leg besides its tag.
 *
 *  For an absence, the reason: `short-circuit` (a confident lexical hit, so the
 *  embed was skipped on purpose) reads identically to `fingerprint` (the index
 *  and embedder disagree, so neighbors would be wrong) if only the tag is
 *  logged, and the two call for opposite responses. For a run, how many
 *  paragraphs the scan considered.
 *
 *  A guard rather than a ternary, per `effect/noTernary`. */
const vectorWhy = (status: VectorLegStatus): string | number => {
  if (status._tag === 'unavailable') return status.reason;
  return status.scanned;
};

/** The locate leg as one total effect over every route.
 *
 *  Only a `locate` route has a destination to resolve; every other route
 *  answers the same typed absence. Spelled as a function rather than inline so
 *  the three legs below read as three legs.
 */
const locateLeg = (
  sources: SearchSources,
  routed: RoutedQuery,
): Effect.Effect<Option.Option<SearchLocateTarget>> => {
  if (routed._tag === 'locate') return locateTarget(sources, routed.refcode);
  return Effect.succeed(Option.none<SearchLocateTarget>());
};

// ---------------------------------------------------------------------------
// Fusion into the result
// ---------------------------------------------------------------------------

/** The rows the vector leg found and the lexical leg did not (§9.2's join).
 *
 *  **One batch statement, not a dropped tail.** The earlier version built its
 *  body map from the lexical rows alone and skipped every vector-only id, on the
 *  argument that a per-id round trip costs more than the recall it buys. Both
 *  halves of that were wrong: `findParagraphsByIdentity` is *one* statement
 *  rather than thirty, and the recall is not a tail — it is the entire reason
 *  the vector leg exists. A query whose FTS leg returns nothing at all (a reader
 *  who described a passage instead of quoting it, which is precisely the query
 *  §9.3 routes to the vector leg) returned *no results whatsoever* under the old
 *  shape, with a `VectorLegRan` status on the result saying the leg had worked.
 *
 *  Degrades to the lexical bodies alone on a corpus fault: an unavailable
 *  lookup means the vector-only candidates cannot be rendered, which is the
 *  pre-fix behavior and still better than failing the search.
 *
 *  **It fetches more ids than the page can show, and that is not the cost.**
 *  `candidateLimit` makes this ~120 ids for a 40-hit page while `fuseResults`
 *  stops at `limit`, so up to 80 rows are fetched and discarded. The waste is
 *  real and provable — `fuse` ranks from ids alone, and RRF is rank-monotonic
 *  within one list, so a vector-only row ranked deeper than `limit` can never
 *  reach a `limit`-hit page (3,000 adversarial trials, deepest reaching rank
 *  exactly 40, zero violations). Fusing first and fetching only the survivors
 *  is therefore *correct*.
 *
 *  It is also not worth doing, because the batch size is not what this costs.
 *  The work inside this leg is ~1 ms: against the same 4.5 GB corpus the
 *  prefiltered statement measures 0.1 ms at 40 ids and 0.2 ms at 120 (the
 *  `para_id` seek dominates and the row count disappears into it), and
 *  `Schema.decodeUnknownSync` over all 120 `nodes_json` payloads costs 0.8 ms.
 *
 *  The leg used to take ~180 ms regardless, and the cause was a query plan, not
 *  this function: under the default `egw` scope the planner drove
 *  `findParagraphsByIdentity` from `idx_books_author` and walked every
 *  paragraph of every Ellen White book instead of seeking 120 `para_id`s. See
 *  the `CROSS JOIN` comment there — 179 ms to 0.2 ms, same rows. `bodiesMs`
 *  should now be single-digit milliseconds warm, and a return to three figures
 *  means that join order regressed.
 */
const vectorOnlyBodies = (
  sources: SearchSources,
  lexical: readonly SearchParagraphRow[],
  vectorIds: readonly string[],
  scope: CorpusScope,
  filter: CorpusFilter,
): Effect.Effect<readonly SearchParagraphRow[]> => {
  const known = new Set(lexical.map((row) => row.paragraphId));
  const missing = vectorIds.filter((id) => !known.has(id));
  if (missing.length === 0) return Effect.succeed([]);
  // The filters go with the lookup.
  //
  // This path is by paragraph *identity*, not by MATCH, so it does not pass
  // through `searchFilters` — and without them it re-admits exactly the books
  // the reader filtered out: the vector leg proposes ids from across the whole
  // index, so a `ModernEnglish` paraphrase or an excluded section reappears
  // here having been correctly dropped from the lexical leg. The statement
  // already joins `books`, so the same predicates apply there rather than
  // being re-derived over the returned rows.
  // Split, because the sum hides where the time goes. `lookupMs` brackets the
  // whole `findParagraphsByIdentity` call — the statement *and* the per-row
  // `decodeNodes` it runs internally — and `hitsMs` brackets `toRow` on top.
  //
  // The split is what proved the leg is overhead rather than work: `lookupMs`
  // sits at ~137 ms while the raw statement measures 0.2 ms and decoding all
  // 120 `nodes_json` payloads 0.8 ms. Roughly 1 ms of work inside a 137 ms
  // call. `hitsMs` reads ~0 because the nodes it maps are already decoded.
  return Effect.gen(function* () {
    const startedAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
    const found = yield* sources.paragraphs.findParagraphsByIdentity(missing, { scope, filter });
    const lookedUpAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
    const mapped = found.map(toRow);
    const mappedAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
    yield* Effect.logInfo('search.bodies.timing').pipe(
      Effect.annotateLogs({
        // The statement plus the `decodeNodes` inside it. Not the statement
        // alone — `findParagraphsByIdentity` decodes every row before
        // returning, so this clock cannot separate the two.
        lookupMs: lookedUpAt - startedAt,
        // `toRow` alone: `nodesToText` over already-decoded nodes.
        hitsMs: mappedAt - lookedUpAt,
        wanted: missing.length,
        // Below `wanted` when the corpus filter dropped rows the vector leg
        // proposed — which is also why fetching only the fused survivors would
        // risk underfilling a page.
        got: found.length,
      }),
    );
    return mapped;
  }).pipe(
    Effect.catchTag(['SqlError', 'ParagraphDataIntegrityError'], (cause) =>
      Effect.logWarning('search.vectorBodies.degraded').pipe(
        Effect.annotateLogs({ reason: String(cause), wanted: missing.length }),
        Effect.as<readonly SearchParagraphRow[]>([]),
      ),
    ),
  );
};

/** Fuses the two legs and rebuilds rows in the fused order (§9.4).
 *
 *  Both legs' bodies are in `bodies` — the lexical rows and the vector-only rows
 *  the batch lookup fetched — so the fused ranking renders whole. An id with no
 *  row is still skipped, but that now means only one thing: the corpus no longer
 *  holds a paragraph the index was built from, which is a stale index rather
 *  than a shape the pipeline creates for itself.
 */
const fuseResults = (
  lexical: readonly SearchParagraphRow[],
  vectorOnly: readonly SearchParagraphRow[],
  vectorIds: readonly string[],
  limit: number,
): readonly SearchParagraphHit[] => {
  const bodies = new Map([...lexical, ...vectorOnly].map((row) => [row.paragraphId, row]));
  const lists: readonly FusionList[] = [
    { ids: lexical.map((row) => row.paragraphId), weight: ORIGINAL_QUERY_WEIGHT },
    { ids: vectorIds, weight: 1 },
  ];
  const hits: SearchParagraphHit[] = [];
  for (const fused of fuse(lists)) {
    const found = Option.fromNullishOr(bodies.get(fused.id));
    if (Option.isNone(found)) continue;
    const body = found.value;
    hits.push(
      SearchParagraphHit.make({
        paragraphId: body.paragraphId,
        publicationId: body.publicationId,
        rawParaId: body.rawParaId,
        refcode: body.refcode,
        bookCode: body.bookCode,
        bookTitle: body.bookTitle,
        author: body.author,
        snippet: body.snippet,
        isHeading: body.isHeading,
        score: fused.score,
        lexicalRank: Option.flatten(Arr.get(fused.ranks, 0)),
        vectorRank: Option.flatten(Arr.get(fused.ranks, 1)),
      }),
    );
    if (hits.length === limit) break;
  }
  return hits;
};

const emptyResult = (input: SearchQuery, status: VectorLegStatus): SearchResult =>
  SearchResult.make({
    query: input.text,
    route: route(input.text)._tag,
    scope: queryScope(input),
    locate: Option.none(),
    paragraphs: [],
    vector: status,
    nonSelective: false,
  });

/** What the layer says about the index it resolved, once, at startup.
 *
 *  The one operator-visible record of which of §9.6's states this process is
 *  in. A reader only ever sees the typed absence on a result; an operator
 *  debugging "why is search lexical-only here" needs the reason at the moment
 *  the decision was made, not per query.
 */
const vectorIndexLogFields = (index: LoadedVectorIndex) => {
  if (index._tag === 'index') return { state: 'active', vectors: index.index.count };
  return { state: 'absent', reason: index.absence.reason };
};

/** Starts resolving the SIMD dot product for a resolved index.
 *
 *  A guard rather than an expression, because there is nothing to accelerate
 *  when no index resolved, and nothing to wait for in either case. */
const primeAccel = (index: LoadedVectorIndex): void => {
  if (index._tag === 'unavailable') return;
  primeVectorAccel(index.index);
};

/** Everything one search reads, resolved.
 *
 *  `index` is the *parsed* index rather than the byte source: §9.5 budgets the
 *  vector leg at ~100-400 ms for the embed, and re-reading and re-parsing a
 *  246 MB artifact inside that budget is not a cost the design ever intended.
 *  The layer resolves it once and every query scans the same `Int8Array`.
 */
interface SearchDeps {
  readonly sourcing: SearchSourcing;
  readonly index: LoadedVectorIndex;
  readonly embedder: Option.Option<QueryEmbedderApi>;
}

const makeQuery =
  (deps: SearchDeps) =>
  (input: SearchQuery): Effect.Effect<SearchResult> =>
    Effect.gen(function* () {
      const sourcing = deps.sourcing;
      // A host that wired no corpus answers honestly: no results, and the
      // vector leg reported absent rather than pretending it ran.
      if (sourcing._tag === 'not-wired') {
        return emptyResult(input, vectorUnavailable('absent'));
      }
      const sources = sourcing.sources;
      const routed = route(input.text);
      const scope = queryScope(input);
      const filter = queryFilter(input);
      // Both legs' pools scale with what the caller asked for; see `candidateLimit`.
      const candidates = candidateLimit(queryLimit(input));

      // Each leg is a span, and the legs are also timed into one log line.
      //
      // The three phases have genuinely different costs and any one of them can
      // dominate — the lexical leg is SQL, the vector leg is an embed plus a
      // scan over ~600k vectors, and the bodies join is one statement by
      // paragraph identity — so "search feels slow" has to be answerable per
      // leg. The spans are the real instrument: they nest under the HTTP span
      // the server already opens and carry attributes a backend can group by.
      //
      // The log line is not a duplicate of them. A span's duration is only
      // *readable* where a tracer exports it, and this service runs in
      // deployments with no OTLP endpoint configured, where `OtlpTracer` is
      // correctly a no-op — leaving the platform log stream as the only place
      // the numbers surface at all. Measuring twice costs three clock reads.
      const startedAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);

      // The lexical leg and the pinned group are independent reads over two
      // corpora, and the result needs both, so they run together.
      const [lexical, locate] = yield* Effect.all(
        [
          lexicalLeg(sources, routed, scope, input.bookCode, filter, candidates),
          locateLeg(sources, routed),
        ],
        { concurrency: 'unbounded' },
      ).pipe(Effect.withSpan('search.lexical', { attributes: { route: routed._tag } }));
      const lexicalAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);

      // The vector leg reads the lexical scores — §9.3's short-circuit is a
      // decision about them — so it is sequenced after rather than beside.
      const vector = yield* vectorLeg(
        deps,
        routed,
        lexical.rows,
        scope,
        input.bookCode,
        filter,
        candidates,
        sources,
      ).pipe(Effect.withSpan('search.vector'));
      const vectorAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);

      // §9.2's join, for the candidates only the vector leg found. One
      // statement, and skipped entirely when the two legs agree on every id.
      const vectorOnly = yield* vectorOnlyBodies(
        sources,
        lexical.rows,
        vector.ids,
        scope,
        filter,
      ).pipe(
        Effect.withSpan('search.bodies', {
          attributes: { vectorStatus: vector.status._tag },
        }),
      );
      const doneAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);

      yield* Effect.logInfo('search.timing').pipe(
        Effect.annotateLogs({
          route: routed._tag,
          vector: vector.status._tag,
          // Why the vector leg did what it did. The tag alone flattens five
          // very different outcomes into the word "unavailable": a deliberate
          // `short-circuit` on a confident lexical hit reads identically to a
          // `fingerprint` mismatch serving silently degraded results. Half the
          // queries in a production sample logged `unavailable` with no way to
          // tell which, so the reason is carried here rather than discarded.
          // `scanned` is the matching fact for the `ran` case: how much of the
          // index the query actually paid for.
          vectorWhy: vectorWhy(vector.status),
          lexicalMs: lexicalAt - startedAt,
          // What makes `lexicalMs` what it is. BM25 scores every document in
          // the posting list to choose the top rows, so the match count is very
          // nearly the whole cost of the lexical leg — and it is the only field
          // here that identifies *which* query was slow. Logged instead of the
          // query text: an investigation needs the offender's cost, not the
          // reader's words. See `LexicalLegResult.matches`.
          matches: lexical.matches,
          vectorMs: vectorAt - lexicalAt,
          bodiesMs: doneAt - vectorAt,
          totalMs: doneAt - startedAt,
          // What the bodies join actually had to fetch. A large number here
          // with a small `bodiesMs` means the join is cheap and the legs simply
          // disagree; a small one with a large `bodiesMs` means the statement
          // itself is the cost, which is what a scan looks like.
          vectorIds: vector.ids.length,
        }),
      );

      return SearchResult.make({
        query: input.text,
        route: routed._tag,
        scope,
        locate,
        paragraphs: fuseResults(lexical.rows, vectorOnly, vector.ids, queryLimit(input)),
        vector: vector.status,
        nonSelective: lexical.nonSelective,
      });
    });

export class SearchService extends Context.Service<SearchService, SearchServiceApi>()(
  '@bible/core/search/SearchService',
) {
  /** Backed by the two corpora §9 reads and the optional index bytes.
   *
   *  `QueryEmbedder` is deliberately *not* in the requirements: it is read with
   *  `Effect.serviceOption`, because §9.5 makes a host with no embedder a legal
   *  client — the no-WebGPU browser — rather than a broken composition.
   *  `VectorIndexBytes` *is* required, and `VectorIndexBytes.None` is how a host
   *  says it ships no index. Absence-by-decision and absence-by-omission again.
   */
  static Live: Layer.Layer<SearchService, never, SearchCorpusSources | VectorIndexBytes> =
    Layer.effect(
      SearchService,
      Effect.gen(function* () {
        const sourcing = yield* SearchCorpusSources;
        const bytes = yield* VectorIndexBytes;
        // **Read and parsed exactly once per process.** §9.5's latency budget is
        // for the embed; re-reading a 246 MB file per query is two orders of
        // magnitude more work than the leg it feeds, and it scaled with query
        // volume rather than with corpus size. The layer is where a resource
        // whose lifetime is the runtime's belongs.
        //
        // A host that already resolved the index hands it over through
        // `ResolvedVectorIndex` rather than making this layer re-read it. That
        // is the CLI's case: `search-layer.ts` has to parse the file to decide
        // whether it is one this build may scan, and before this seam existed it
        // then passed the *byte source* down and paid for a second full read and
        // parse at startup (round-2 F8). Absent means no host pre-resolved
        // anything, and the bytes are read here — the desktop and browser path.
        //
        // It cannot fail: `loadVectorIndex` maps every fault onto §9.6's typed
        // absence, so a host whose index is missing, truncated or foreign still
        // builds a working lexical-only `SearchService`.
        const resolved = yield* Effect.serviceOption(ResolvedVectorIndex);
        const index = yield* Option.match(resolved, {
          onSome: (value) => Effect.succeed(value),
          onNone: () => loadVectorIndex.pipe(Effect.provideService(VectorIndexBytes, bytes)),
        });
        yield* Effect.logInfo('search.vectorIndex.resolved').pipe(
          Effect.annotateLogs(vectorIndexLogFields(index)),
        );
        // Everything resolved while the layer builds, and passed as values
        // rather than read from context inside `query`.
        // `SearchServiceApi.query` returns an `Effect` with no requirements —
        // that is what lets the two visual hosts call it across a MessagePort —
        // so everything the pipeline needs has to be closed over here.
        //
        // The embedder is an *option*, because §9.5 makes a host with no
        // adapter a legal client (the no-WebGPU browser) rather than a broken
        // composition. `Effect.serviceOption` is how that stays expressible
        // without putting `QueryEmbedder` in the layer's requirements, where it
        // would make every host wire one.
        const embedder = yield* Effect.serviceOption(QueryEmbedder);
        // The SIMD dot product, resolved here for the same reason the index is:
        // loading it is host work — a `dlopen` or a `WebAssembly.instantiate` —
        // and doing it inside `query` made the whole search path asynchronous.
        // That is not merely slower; it broke every caller that runs a search
        // with `Effect.runSync`, which the golden-route suite does.
        // Start resolving the SIMD tier, and do not wait for it.
        //
        // Loading it is asynchronous host work, and `query` has to stay
        // runnable with `Effect.runSync` — hosts do that, and so does the
        // golden-route suite. Yielding here would make the whole layer
        // asynchronous and break them. The first queries answer from the
        // TypeScript loop; every one after the tier lands is accelerated.
        primeAccel(index);
        const run = makeQuery({ sourcing, index, embedder });
        return SearchService.of({
          query: Effect.fn('SearchService.query')(run),
        });
      }),
    );
}
