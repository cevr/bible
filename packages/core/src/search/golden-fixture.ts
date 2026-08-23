/** §9.7's golden query set, and the corpus it runs against.
 *
 *  "One golden query set runs on web, desktop, and CLI. Ordered result
 *  identities and fallback behavior must match within declared numeric
 *  tolerances." That is only checkable if there is *one* set, in one module, that
 *  all three clients import — a fixture copied into three suites is three
 *  fixtures whose agreement is a coincidence waiting to end, which is the
 *  argument `wiki/testing.ts` already makes for the Daniel 8 phrase fixture.
 *
 *  Exported through `@bible/core/search/testing`, never through
 *  `@bible/core/search`: a synthetic ten-paragraph corpus sitting in the
 *  namespace an app imports `SearchService` from is a corpus a shipped code path
 *  can reach for. Core's own suites import this file relatively.
 *
 *  **The queries are chosen to cover §9.3's table and §9.6's absences**, which is
 *  what §12 leaves open ("which queries and how many are chosen when Milestone 8
 *  starts"). Each one is here because it is the only query in the set that
 *  exercises some branch: the quoted one is the only phrase route, the refcode
 *  one is the only locate route, the one-word one is the only non-wordy hybrid,
 *  and the strong-hit one is the only short-circuit.
 */

import { Effect, Layer, Option, Schema } from 'effect';

import { Node } from '../egw/ast.js';
import {
  EGWParagraphDatabase,
  paragraphIdentity,
  type BookRow,
  type TestParagraph,
} from '../egw-db/book-database.js';
import { WikiService } from '../wiki/service.js';
import { WikiSectionSources } from '../wiki/section-composer.js';
import { TopicDetail, TopicId } from '../topics/model.js';
import { topicSlug } from '../wiki/model.js';
import { TopicService } from '../topics/service.js';
import { SearchQuery, type SearchRoute, type VectorAbsenceReason } from './model.js';
import type { QueryEmbedder } from './embedder.js';
import { SearchCorpusSources, SearchService } from './service.js';
import { VectorIndexBytes } from './vector-artifact.js';
import {
  DIMENSIONS,
  encodeVectorIndex,
  MODEL_FINGERPRINT,
  VectorBookRange,
  VectorManifest,
  quantize,
} from './vector-index.js';

// ---------------------------------------------------------------------------
// The corpus
// ---------------------------------------------------------------------------

const book = (code: string, title: string, author: string, id: number): BookRow => ({
  book_id: id,
  book_code: code,
  book_title: title,
  book_author: author,
  paragraph_count: 0,
  created_at: '2026-01-01T00:00:00Z',
});

/** Two EGW books and one pioneer book.
 *
 *  The pioneer book is what makes the scope tests non-vacuous: §9.2 pins the
 *  vector index to the EGW/White-Estate partition, so a `pioneer`-scoped query
 *  must reach paragraphs the index cannot contain — and a fixture with only EGW
 *  books could not tell a working scope filter from an absent one. */
export const GOLDEN_BOOKS: readonly BookRow[] = [
  book('GC', 'The Great Controversy', 'Ellen Gould White', 1),
  book('DA', 'The Desire of Ages', 'Ellen Gould White', 2),
  book('DAR', 'Daniel and the Revelation', 'Uriah Smith', 3),
];

const paragraph = (input: {
  readonly bookCode: string;
  readonly refcode: string;
  readonly text: string;
  readonly order: number;
  readonly ftsRank?: number;
}): TestParagraph => ({
  para_id: Option.some(`${input.bookCode}-${String(input.order)}`),
  refcode_short: Option.some(input.refcode),
  refcode_long: `${input.bookCode} ${input.refcode}`,
  nodes: [Node.make({ _tag: 'Text', text: input.text })],
  puborder: input.order,
  bookCode: input.bookCode,
  ftsRank: input.ftsRank,
});

/** Ten paragraphs, with the FTS ranks the double reports.
 *
 *  The ranks are the fixture's most load-bearing data: `GC 425.1` carries a rank
 *  that clears `STRONG_BM25_THRESHOLD` and separates from the runner-up by more
 *  than `BM25_SEPARATION_RATIO`, which is what makes the short-circuit query
 *  short-circuit. The rest sit in the weak regime so the hybrid queries reach the
 *  vector leg. Negative, because that is what FTS5 reports and the fixture models
 *  what SQLite would say rather than what the pipeline prefers. */
export const GOLDEN_PARAGRAPHS: readonly TestParagraph[] = [
  paragraph({
    bookCode: 'GC',
    refcode: 'GC 425.1',
    text: 'The sanctuary in heaven is the very center of Christ’s work in behalf of men.',
    order: 1,
    ftsRank: -14,
  }),
  paragraph({
    bookCode: 'GC',
    refcode: 'GC 425.2',
    text: 'It concerns every soul living upon the earth.',
    order: 2,
    ftsRank: -2,
  }),
  paragraph({
    bookCode: 'GC',
    refcode: 'GC 489.1',
    text: 'When the work of the investigative judgment closes, the cases of all are decided.',
    order: 3,
    ftsRank: -3,
  }),
  paragraph({
    bookCode: 'GC',
    refcode: 'GC 490.1',
    text: 'Probation closes and the destiny of every soul is fixed forever.',
    order: 4,
    ftsRank: -2.5,
  }),
  paragraph({
    bookCode: 'DA',
    refcode: 'DA 311.5',
    text: 'The law written in the heart is the covenant God makes with his people.',
    order: 5,
    ftsRank: -2.2,
  }),
  paragraph({
    bookCode: 'DA',
    refcode: 'DA 555.1',
    text: 'What happens when the close of probation arrives is decided by present choices.',
    order: 6,
    ftsRank: -2.8,
  }),
  paragraph({
    bookCode: 'DA',
    refcode: 'DA 556.1',
    text: 'The daily ministration of the priest prefigured the work of our high priest.',
    order: 7,
    ftsRank: -2.1,
  }),
  paragraph({
    bookCode: 'DAR',
    refcode: 'DAR 62.1',
    text: 'The sanctuary of the eighth chapter of Daniel is the sanctuary of the new covenant.',
    order: 8,
    ftsRank: -3.4,
  }),
  paragraph({
    bookCode: 'DAR',
    refcode: 'DAR 63.1',
    text: 'The daily as the pioneers used the word denotes the paganism of Rome.',
    order: 9,
    ftsRank: -2.6,
  }),
  paragraph({
    bookCode: 'DAR',
    refcode: 'DAR 280.5',
    text: 'The king of the north shall come to his end and none shall help him.',
    order: 10,
    ftsRank: -2.4,
  }),
];

// ---------------------------------------------------------------------------
// The vector index
// ---------------------------------------------------------------------------

/** The EGW-scope paragraph ids the index covers, in buffer order.
 *
 *  Exactly the `GC` and `DA` paragraphs: §9.2 pins the index to the
 *  EGW/White-Estate partition, and a fixture index that also covered `DAR` would
 *  let a scope bug pass. */
export const GOLDEN_VECTOR_IDS: readonly string[] = GOLDEN_PARAGRAPHS.filter(
  (row) => row.bookCode !== 'DAR',
).map((row) =>
  paragraphIdentity(
    row.bookCode,
    row.para_id,
    Option.getOrElse(row.refcode_short, () => ''),
  ),
);

/** A deterministic pseudo-embedding.
 *
 *  Not a real one, and it does not need to be: what the fixture has to pin is
 *  that the *scan* returns a stable, reproducible order for a given query, which
 *  a deterministic hash gives without a 300M-parameter model in the test suite.
 *  The real adapters are checked against each other in the adapter parity test,
 *  which is the only place a real model belongs. */
export const goldenVector = (seed: string): Int8Array => {
  const values = new Float32Array(DIMENSIONS);
  let state = 2166136261;
  for (const character of seed) {
    state = Math.imul(state ^ (character.codePointAt(0) ?? 0), 16777619) >>> 0;
  }
  for (let axis = 0; axis < DIMENSIONS; axis += 1) {
    state = Math.imul(state ^ (axis + 1), 16777619) >>> 0;
    values[axis] = (state % 2000) / 1000 - 1;
  }
  return quantize(values);
};

/** The fixture index: one vector per EGW-scope paragraph, in `GOLDEN_VECTOR_IDS`
 *  order, under the pinned fingerprint. */
export const goldenVectorIndexBytes = (fingerprint: string = MODEL_FINGERPRINT): ArrayBuffer => {
  const vectors = new Int8Array(GOLDEN_VECTOR_IDS.length * DIMENSIONS);
  GOLDEN_VECTOR_IDS.forEach((id, row) => {
    vectors.set(goldenVector(id), row * DIMENSIONS);
  });
  const gc = GOLDEN_VECTOR_IDS.filter((id) => id.startsWith('GC:')).length;
  return encodeVectorIndex({
    fingerprint,
    manifest: VectorManifest.make({
      books: [
        VectorBookRange.make({ bookCode: 'GC', offset: 0, count: gc }),
        VectorBookRange.make({
          bookCode: 'DA',
          offset: gc,
          count: GOLDEN_VECTOR_IDS.length - gc,
        }),
      ],
      paragraphIds: GOLDEN_VECTOR_IDS,
    }),
    vectors,
  });
};

// ---------------------------------------------------------------------------
// The pinned topic group (§9.4)
// ---------------------------------------------------------------------------

/** The one topic the golden set matches, and the query it matches.
 *
 *  §9.4 puts topic pages *above* the ranking as a pinned group, never inside
 *  it — and that is only a checkable claim if some golden query actually
 *  produces a topic. With an empty catalog every assertion about pinning is
 *  vacuously true: "topics is an array" passes, and so does "the two hosts'
 *  topic sets are equal", because both are empty.
 *
 *  The name is the query text verbatim because `TopicService.Test` matches by
 *  substring on the name — the double's rule, not the corpus's. The slug is
 *  what the pinned group carries and what the assertions pin.
 */
export const GOLDEN_TOPIC_QUERY = 'what happens at the close of probation';
/** Branded, because that is what a `SearchTopicHit.slug` is: a test that
 *  compares against a plain string is comparing against a different type than
 *  the one the result carries. */
export const GOLDEN_TOPIC_SLUG = topicSlug('close-of-probation');

const GOLDEN_TOPICS: readonly TopicDetail[] = [
  TopicDetail.make({
    id: Schema.decodeSync(TopicId)(String(GOLDEN_TOPIC_SLUG)),
    // Contains `GOLDEN_TOPIC_QUERY`, so the double's substring match finds it.
    name: `What happens at the close of probation`,
    alternativeNames: [],
    sections: [],
  }),
];

// ---------------------------------------------------------------------------
// The queries
// ---------------------------------------------------------------------------

/** One golden query and what §9 says must happen to it.
 *
 *  The expectation is the *route* and the *vector absence*, not a result list.
 *  §9.7 asks the three clients to agree on "ordered result identities and
 *  fallback behavior", and the identities are compared client-to-client at run
 *  time — pinning them here would pin this fixture corpus into the acceptance
 *  rule, and the rule is about agreement rather than about these ten paragraphs.
 *  The route and the absence *are* pinned, because they are §9.3's and §9.6's
 *  contract and must not vary by host at all. */
export interface GoldenQuery {
  readonly label: string;
  readonly query: SearchQuery;
  readonly route: SearchRoute;
  /** `None` when the vector leg is expected to run. */
  readonly absence: Option.Option<VectorAbsenceReason>;
}

const query = (input: {
  readonly text: string;
  readonly scope?: 'egw' | 'pioneer' | 'all';
}): SearchQuery =>
  SearchQuery.make({
    text: input.text,
    scope: Option.fromNullishOr(input.scope),
    bookCode: Option.none(),
    limit: Option.none(),
  });

/** The set, when a valid index and a working embedder are both present.
 *
 *  Six queries, each the only one covering its branch. Anything a seventh would
 *  add is a variation on one of these, and §9.7's rule is that three clients
 *  agree — which a longer set makes slower to check and no stronger. */
export const GOLDEN_QUERIES: readonly GoldenQuery[] = [
  {
    label: 'quoted phrase routes lexical-only',
    query: query({ text: '"the daily"' }),
    route: 'phrase',
    absence: Option.some('route'),
  },
  {
    label: 'refcode routes to the locate-jump',
    query: query({ text: 'GC 425' }),
    route: 'locate',
    absence: Option.some('route'),
  },
  {
    label: 'refcode with a paragraph still routes to locate',
    query: query({ text: 'DA 311.5' }),
    route: 'locate',
    absence: Option.some('route'),
  },
  {
    label: 'a one-word query is not wordy enough for the vector leg',
    query: query({ text: 'sanctuary' }),
    route: 'hybrid',
    absence: Option.some('route'),
  },
  {
    label: 'a wordy query with a weak lexical top hit runs the vector leg',
    query: query({ text: 'what happens at the close of probation' }),
    route: 'hybrid',
    absence: Option.none(),
  },
  {
    label: 'a pioneer-scoped query has no vectors to scan',
    query: query({ text: 'the king of the north', scope: 'pioneer' }),
    route: 'hybrid',
    absence: Option.some('absent'),
  },
];

// ---------------------------------------------------------------------------
// The layer
// ---------------------------------------------------------------------------

/** A `SearchService` over the fixture corpus, parameterized by what the host is
 *  pretending to have.
 *
 *  One builder rather than a layer per scenario, because every §10 core test and
 *  every host adapter test differs only in these two knobs — which index bytes,
 *  and which embedder — and three suites each assembling the graph is three
 *  places for the fixture corpus to be wired slightly differently. */
/** The fixture corpus alone, without a choice of index bytes.
 *
 *  Exported for the one suite that must supply its own `VectorIndexBytes` — the
 *  read-counting test in `vector-artifact.test.ts`, which cannot use
 *  {@link goldenSearchLayer} because that builder provides the byte source from
 *  its `index` argument and would shadow the counting one. */
export const goldenSearchSources: Layer.Layer<SearchCorpusSources> = Layer.unwrap(
  Effect.gen(function* () {
    return SearchCorpusSources.wired({
      paragraphs: yield* EGWParagraphDatabase,
      wiki: yield* WikiService,
    });
  }),
).pipe(
  Layer.provide(EGWParagraphDatabase.Test({ books: GOLDEN_BOOKS, paragraphs: GOLDEN_PARAGRAPHS })),
  // `Layer.fresh`, because Effect memoizes a layer per tag per build keyed on
  // layer *identity*, and `WikiService.Absent` is one shared layer object. A
  // graph that also merges `procedureDependencies`' `emptyWiki` — the same
  // `Absent` layer over an empty `TopicService` — resolves both occurrences to
  // whichever was built first. That silently replaced this fixture's catalog
  // with an empty one behind the RPC seam while the CLI seam, which builds the
  // fixture alone, kept it: §9.7's parity property was reporting agreement that
  // did not exist. `fresh` opts this build out of that sharing, so the fixture's
  // catalog survives being merged next to any other `WikiService`.
  Layer.provide(
    Layer.fresh(
      WikiService.Absent.pipe(
        Layer.provide(TopicService.Test(GOLDEN_TOPICS)),
        Layer.provide(WikiSectionSources.NotWired),
      ),
    ),
  ),
);

export const goldenSearchLayer = (input?: {
  readonly index?: Option.Option<ArrayBuffer>;
  readonly embedder?: Layer.Layer<QueryEmbedder>;
}): Layer.Layer<SearchService> => {
  const bytes = Option.match(input?.index ?? Option.none<ArrayBuffer>(), {
    onNone: () => VectorIndexBytes.None,
    onSome: (buffer) => VectorIndexBytes.layerOf(buffer),
  });

  const service = SearchService.Live.pipe(Layer.provide(goldenSearchSources), Layer.provide(bytes));
  // `QueryEmbedder` is read with `Effect.serviceOption`, so a fixture without
  // one is the no-WebGPU host and a fixture with one is the two native
  // adapters — the same composition difference the real hosts have.
  return Option.match(Option.fromNullishOr(input?.embedder), {
    onNone: () => service,
    onSome: (embedder) => service.pipe(Layer.provide(embedder)),
  });
};
