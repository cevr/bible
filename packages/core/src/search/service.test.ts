/** §10 Milestone 8's core tests, minus the two that have their own files.
 *
 *  - strong-BM25 short-circuit skips the vector leg on a confident lexical top hit
 *  - absent index yields lexical-only results carrying `VectorIndexUnavailable`
 *  - a model-fingerprint mismatch invalidates the vector leg rather than
 *    returning wrong neighbors
 *  - the ranking is writings rows and nothing else
 *
 *  Every one of them fails without the code it names: the fixture's FTS ranks
 *  put the short-circuit query in the strong regime and everything else in the
 *  weak one, so removing the short-circuit changes an assertion here rather than
 *  changing nothing. */

import { describe, expect, it, test } from 'effect-bun-test';
import { Effect, Layer, Match, Option } from 'effect';

import { QueryEmbedder, QueryEmbedderUnavailable, vectorsAgree } from './embedder.js';
import {
  goldenSearchLayer,
  goldenVector,
  GOLDEN_BOOKS,
  GOLDEN_PARAGRAPHS,
  goldenVectorIndexBytes,
  GOLDEN_QUERIES,
  GOLDEN_TOPIC_QUERY,
  GOLDEN_TOPIC_SLUG,
  GOLDEN_VECTOR_IDS,
} from './golden-fixture.js';
import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import { SearchQuery, type VectorAbsenceReason } from './model.js';
import { VectorIndexBytes } from './vector-artifact.js';
import { MODEL_FINGERPRINT } from './vector-index.js';
import {
  isNonSelective,
  isStrongLexicalHit,
  normalizeScore,
  SearchCorpusSources,
  SearchService,
  STRONG_SIGNAL_MIN_GAP,
  STRONG_SIGNAL_MIN_SCORE,
} from './service.js';

/** An embedder that always answers, under whichever fingerprint it is given.
 *  The fingerprint is a parameter because the mismatch test's whole premise is
 *  an adapter and an index that disagree. */
const embedderLayer = (fingerprint: string): Layer.Layer<QueryEmbedder> =>
  Layer.succeed(
    QueryEmbedder,
    QueryEmbedder.of({
      fingerprint,
      embedQuery: (query) => Effect.succeed(goldenVector(query)),
      embedDocument: (text) => Effect.succeed(goldenVector(text)),
    }),
  );

const search = (
  input: {
    readonly text: string;
    readonly scope?: 'egw' | 'pioneer' | 'all';
    readonly bookCode?: string;
  },
  layer: Layer.Layer<SearchService>,
) =>
  Effect.flatMap(SearchService, (service) =>
    service.query(
      SearchQuery.make({
        text: input.text,
        scope: Option.fromNullishOr(input.scope),
        bookCode: Option.fromNullishOr(input.bookCode),
        limit: Option.none(),
      }),
    ),
  ).pipe(Effect.provide(layer));

/** The same call for an already-built {@link SearchQuery}, as the golden set holds. */
const queryWith = (query: SearchQuery, layer: Layer.Layer<SearchService>) =>
  Effect.flatMap(SearchService, (service) => service.query(query)).pipe(Effect.provide(layer));

const withIndex = (fingerprint?: string) =>
  goldenSearchLayer({
    index: Option.some(goldenVectorIndexBytes(fingerprint)),
    embedder: embedderLayer(MODEL_FINGERPRINT),
  });

const absence = (reason: VectorAbsenceReason) => reason;

// ---------------------------------------------------------------------------

describe('§9.3 the strong-BM25 short-circuit', () => {
  test('uses qmd’s two constants, unchanged', () => {
    // The values from `store.ts` ~415. They are asserted rather than imported
    // and trusted because substituting them with thresholds over raw BM25 is
    // exactly the drift this suite exists to catch.
    expect(STRONG_SIGNAL_MIN_SCORE).toBe(0.85);
    expect(STRONG_SIGNAL_MIN_GAP).toBe(0.15);
  });

  test('normalizes each FTS rank with qmd’s saturating map', () => {
    // `|bm25| / (1 + |bm25|)`, and the four scale points qmd's own comment
    // states: strong(-10) → 0.91, medium(-2) → 0.67, weak(-0.5) → 0.33,
    // none(0) → 0.
    expect(normalizeScore(10)).toBeCloseTo(0.91, 2);
    expect(normalizeScore(2)).toBeCloseTo(0.67, 2);
    expect(normalizeScore(0.5)).toBeCloseTo(0.33, 2);
    expect(normalizeScore(0)).toBe(0);
    // Bounded below 1, which is what keeps the 0.85 floor reachable-from-below
    // and therefore meaningful.
    expect(normalizeScore(1e6)).toBeLessThan(1);
  });

  test('is query-independent, unlike a per-query normalization', () => {
    // The property qmd's comment names, and the reason min-max is wrong here:
    // a score's normalized value must not depend on what else matched. Under
    // min-max the top hit is 1 on every query, so the 0.85 floor is vacuous and
    // the predicate collapses to the gap alone.
    expect(normalizeScore(4)).toBe(normalizeScore(4));
    expect(isStrongLexicalHit([4, 2.8])).toBe(isStrongLexicalHit([4, 2.8, 0.1, 0.05]));
  });

  test('fires when the normalized top hit is strong and clearly separated', () => {
    // top = 14/15 = 0.933, runner-up = 1.429/2.429 = 0.588; gap 0.345.
    expect(isStrongLexicalHit([14, 1.429, 1.286])).toBe(true);
  });

  test('does not fire on a strong top hit in a strong field', () => {
    // §9.3 asks for two conditions. A strong hit among equally strong hits means
    // the query matched a common formula, and the ranking help embeddings give
    // is exactly what that reader needs. top = 0.933, runner-up = 0.929; the
    // gap is 0.005.
    expect(isStrongLexicalHit([14, 13])).toBe(false);
  });

  test('does not fire on a top hit below the absolute floor', () => {
    // 0.85 is exactly |bm25| >= 5.667. A top hit of 4.0 normalizes to 0.800 and
    // is refused however well separated it is — which is the half of the
    // predicate a min-max normalization would have thrown away.
    expect(normalizeScore(4)).toBeCloseTo(0.8, 3);
    expect(isStrongLexicalHit([4, 0])).toBe(false);
    // And 5.667 upward passes.
    expect(isStrongLexicalHit([5.7, 0])).toBe(true);
  });

  test('does not fire on the fixture’s weak-regime query', () => {
    // The scores the golden corpus actually produces for "what happens at the
    // close of probation": top 4.0 → 0.800, runner-up 2.8 → 0.737. It fails the
    // floor *and* the gap, which is why that query reaches the vector leg.
    expect(isStrongLexicalHit([4, 2.8, 1.786, 1.714])).toBe(false);
  });

  test('fires on a lone hit, which is as separated as a hit can be', () => {
    expect(isStrongLexicalHit([14])).toBe(true);
    // Still subject to the floor: a lone *weak* hit is not a confident answer.
    expect(isStrongLexicalHit([0.3])).toBe(false);
  });

  test('does not fire on an empty lexical list', () => {
    // Nothing matched, so there is nothing to be confident about — and this is
    // precisely the query the vector leg exists to rescue.
    expect(isStrongLexicalHit([])).toBe(false);
  });

  /** The selectivity gate, asserted against the counts actually measured on the
   *  deployed corpus rather than round numbers. `ORDER BY rank` scores every
   *  match, so its cost is linear in these figures — `the` cost 2,129 ms and
   *  `sabbath` 82 ms — and the threshold is where a term stops discriminating
   *  at all: the top hit for `the` is a paragraph repeating the word, scored
   *  `-0.000`.
   *
   *  The boundary is asserted from both sides because the two nearest real
   *  terms sit close to it: `is` at 775,189 is gated and `god` at 570,900 is
   *  not, and `god` is a legitimate one-word search in this corpus. A change
   *  that gated it would trade a working query for a latency number. */
  test('gates only terms that match too much of the corpus to rank', () => {
    // Stopwords, measured: the ranking they buy is a term-density artifact.
    expect(isNonSelective(1_621_088)).toBe(true); // "the", 53.8% of the corpus
    expect(isNonSelective(940_692)).toBe(true); //   "a", 31.2%
    expect(isNonSelective(775_189)).toBe(true); //   "is", 25.7%

    // Real search terms, measured: all already answer well inside a second.
    expect(isNonSelective(570_900)).toBe(false); // "god", 19.0%, 653 ms
    expect(isNonSelective(299_913)).toBe(false); // "lord", 10.0%, 340 ms
    expect(isNonSelective(68_411)).toBe(false); //  "sabbath", 2.3%, 82 ms
    expect(isNonSelective(1_304)).toBe(false); //   "latter rain", 0.04%, 2 ms

    // A query matching nothing is selective, not non-selective: the gate must
    // never stand between a reader and an empty result they can act on.
    expect(isNonSelective(0)).toBe(false);
  });

  it.effect('skips the vector leg end to end on a confident lexical hit', () =>
    Effect.gen(function* () {
      // The fixture gives `GC 425.1` a rank of -14 against a runner-up of -3, so a
      // query reaching it lands in the strong, separated regime.
      const result = yield* search({ text: 'the sanctuary in heaven is the center' }, withIndex());
      expect(result.vector._tag).toBe('unavailable');
      if (result.vector._tag !== 'unavailable') return;
      expect(result.vector.reason).toBe(absence('short-circuit'));
      // Lexical-only, but a full answer: the short-circuit is an optimization,
      // never a degradation of what the reader sees.
      expect(result.paragraphs.length).toBeGreaterThan(0);
      expect(Option.isSome(result.paragraphs[0]?.lexicalRank ?? Option.none())).toBe(true);
    }),
  );

  it.effect('runs the vector leg when the lexical top hit is weak', () =>
    Effect.gen(function* () {
      // The same corpus, a query whose best FTS rank is in the weak regime.
      const result = yield* search({ text: 'what happens at the close of probation' }, withIndex());
      expect(result.vector._tag).toBe('ran');
      if (result.vector._tag !== 'ran') return;
      expect(result.vector.scanned).toBe(GOLDEN_VECTOR_IDS.length);
    }),
  );

  /** Round-2 B6: the result reports what the scan considered, not the size of
   *  the index. The fixture's `DA` range holds 3 of its 7 vectors, so a
   *  book-narrowed query separates the two numbers and an implementation
   *  reporting `index.count` fails this assertion. */
  it.effect('reports the narrowed scan’s own count for a book-scoped query', () =>
    Effect.gen(function* () {
      const daVectors = GOLDEN_VECTOR_IDS.filter((id) => id.startsWith('DA:')).length;
      expect(daVectors).toBeLessThan(GOLDEN_VECTOR_IDS.length);
      const result = yield* search(
        { text: 'what happens at the close of probation', bookCode: 'DA' },
        withIndex(),
      );
      expect(result.vector._tag).toBe('ran');
      if (result.vector._tag !== 'ran') return;
      expect(result.vector.scanned).toBe(daVectors);
    }),
  );
});

describe('§9.6 an absent index yields lexical-only results carrying the typed absence', () => {
  it.effect('reports `absent` and still answers', () =>
    Effect.gen(function* () {
      const result = yield* search(
        { text: 'what happens at the close of probation' },
        goldenSearchLayer({ index: Option.none() }),
      );
      expect(result.vector._tag).toBe('unavailable');
      if (result.vector._tag !== 'unavailable') return;
      expect(result.vector.reason).toBe(absence('absent'));
      // The point of the whole degradation: search still works.
      expect(result.paragraphs.length).toBeGreaterThan(0);
      for (const hit of result.paragraphs) {
        expect(Option.isSome(hit.lexicalRank)).toBe(true);
        expect(hit.vectorRank).toEqual(Option.none());
      }
    }),
  );

  it.effect('reports `embedder` when the index is present but no adapter is wired', () =>
    Effect.gen(function* () {
      // The no-WebGPU web client (§9.5). A legal composition, not a broken one —
      // which is why `QueryEmbedder` is read with `Effect.serviceOption`.
      const result = yield* search(
        { text: 'what happens at the close of probation' },
        goldenSearchLayer({ index: Option.some(goldenVectorIndexBytes()) }),
      );
      expect(result.vector._tag).toBe('unavailable');
      if (result.vector._tag !== 'unavailable') return;
      expect(result.vector.reason).toBe(absence('embedder'));
      expect(result.paragraphs.length).toBeGreaterThan(0);
    }),
  );

  it.effect('reports `embedder` when the adapter declines at embed time', () =>
    Effect.gen(function* () {
      // WebGPU lost, or the model file gone after the layer was built. The same
      // reader-visible state as no adapter at all: one reason, one state.
      const declining = Layer.succeed(
        QueryEmbedder,
        QueryEmbedder.of({
          fingerprint: MODEL_FINGERPRINT,
          embedQuery: () =>
            QueryEmbedderUnavailable.make({ adapter: 'test', reason: 'device lost' }),
          embedDocument: () =>
            QueryEmbedderUnavailable.make({ adapter: 'test', reason: 'device lost' }),
        }),
      );
      const result = yield* search(
        { text: 'what happens at the close of probation' },
        goldenSearchLayer({
          index: Option.some(goldenVectorIndexBytes()),
          embedder: declining,
        }),
      );
      expect(result.vector._tag).toBe('unavailable');
      if (result.vector._tag !== 'unavailable') return;
      expect(result.vector.reason).toBe(absence('embedder'));
    }),
  );

  it.effect('reports `route` on a quoted phrase, which §9.3 makes lexical-only', () =>
    Effect.gen(function* () {
      const result = yield* search({ text: '"the daily"' }, withIndex());
      expect(result.route).toBe('phrase');
      expect(result.vector._tag).toBe('unavailable');
      if (result.vector._tag !== 'unavailable') return;
      expect(result.vector.reason).toBe(absence('route'));
    }),
  );

  it.effect('reports `route` on a query that is not wordy enough', () =>
    Effect.gen(function* () {
      const result = yield* search({ text: 'sanctuary' }, withIndex());
      expect(result.vector._tag).toBe('unavailable');
      if (result.vector._tag !== 'unavailable') return;
      expect(result.vector.reason).toBe(absence('route'));
    }),
  );
});

describe('§10 a fingerprint mismatch invalidates rather than misleads', () => {
  it.effect('refuses an index built for another model', () =>
    Effect.gen(function* () {
      // The index says one model, the adapter says another. Scanning anyway would
      // return neighbors — plausible-looking, meaningless ones — which is the
      // exact failure §10 singles out.
      const result = yield* search(
        { text: 'what happens at the close of probation' },
        goldenSearchLayer({
          index: Option.some(goldenVectorIndexBytes('some-other-model/512d')),
          embedder: embedderLayer(MODEL_FINGERPRINT),
        }),
      );
      expect(result.vector._tag).toBe('unavailable');
      if (result.vector._tag !== 'unavailable') return;
      expect(result.vector.reason).toBe(absence('fingerprint'));
      // No vector-only rows, and no vector rank on any row.
      for (const hit of result.paragraphs) {
        expect(hit.vectorRank).toEqual(Option.none());
      }
    }),
  );

  it.effect('refuses when the adapter is the one that drifted', () =>
    Effect.gen(function* () {
      // The other direction: a valid index, an adapter pointed at a different
      // model. Detected only because the adapter reports what it loaded rather
      // than being assumed to be the pinned constant.
      const result = yield* search(
        { text: 'what happens at the close of probation' },
        goldenSearchLayer({
          index: Option.some(goldenVectorIndexBytes()),
          embedder: embedderLayer('EmbeddingGemma-300M/768d/fp32'),
        }),
      );
      expect(result.vector._tag).toBe('unavailable');
      if (result.vector._tag !== 'unavailable') return;
      expect(result.vector.reason).toBe(absence('fingerprint'));
    }),
  );
});

describe('§9.4 the result is the writings, and only the writings', () => {
  it.effect('answers a topic-shaped query out of the corpus alone', () =>
    Effect.gen(function* () {
      // The query the topic catalog is named for, asked of a service that has no
      // wiki at all. It is still a corpus query and still ranks paragraphs —
      // which is the whole claim left after the pinned topics group moved out to
      // the applications that have a wiki to fetch it from.
      const result = yield* search({ text: GOLDEN_TOPIC_QUERY }, withIndex());
      const paragraphIds = result.paragraphs.map((hit) => hit.paragraphId);
      expect(paragraphIds.length).toBeGreaterThan(0);
      // Every row is a writings row: a topic slug is not a paragraph identity,
      // so nothing from a catalog can have leaked into the ranking.
      for (const id of paragraphIds) {
        expect(id.includes(GOLDEN_TOPIC_SLUG)).toBe(false);
      }
      for (const hit of result.paragraphs) {
        expect(hit.refcode.length).toBeGreaterThan(0);
        expect(hit.bookCode.length).toBeGreaterThan(0);
      }
    }),
  );
});

describe('§9.4 vector-only candidates reach the result', () => {
  it.effect('returns rows the lexical leg never matched', () =>
    Effect.gen(function* () {
      // A query whose words appear in *no* paragraph, so FTS returns nothing.
      // The vector leg still scans and names ids, and the batch lookup fetches
      // their rows — which is the entire recall benefit of hybrid search. The
      // earlier code built its body map from the lexical rows alone and
      // therefore returned an empty result here, with a `ran` status on it.
      const embedder = Layer.succeed(
        QueryEmbedder,
        QueryEmbedder.of({
          fingerprint: MODEL_FINGERPRINT,
          // Answers with the vector of a known indexed paragraph, so the scan's
          // top neighbor is a row the lexical leg cannot have produced.
          embedQuery: () => Effect.succeed(goldenVector(GOLDEN_VECTOR_IDS[2] ?? '')),
          embedDocument: (text: string) => Effect.succeed(goldenVector(text)),
        }),
      );
      const result = yield* search(
        { text: 'zzqq wwxx yyvv uutt ssrr' },
        goldenSearchLayer({ index: Option.some(goldenVectorIndexBytes()), embedder }),
      );

      expect(result.vector._tag).toBe('ran');
      // Rows, despite an empty lexical leg.
      expect(result.paragraphs.length).toBeGreaterThan(0);
      // Every one of them is vector-only: ranked by the vector list and by no
      // lexical list.
      for (const hit of result.paragraphs) {
        expect(hit.lexicalRank).toEqual(Option.none());
        expect(Option.isSome(hit.vectorRank)).toBe(true);
        // And rendered whole — the batch lookup fetched a real row, not a stub.
        expect(hit.snippet.length).toBeGreaterThan(0);
        expect(hit.bookTitle.length).toBeGreaterThan(0);
      }
      // The nearest neighbor of its own vector leads, as the scan ordered it.
      expect(result.paragraphs[0]?.paragraphId).toBe(GOLDEN_VECTOR_IDS[2]);
    }),
  );

  it.effect('fuses a row both legs found above one only the vector leg found', () =>
    Effect.gen(function* () {
      const result = yield* search({ text: GOLDEN_TOPIC_QUERY }, withIndex());
      const both = result.paragraphs.filter(
        (hit) => Option.isSome(hit.lexicalRank) && Option.isSome(hit.vectorRank),
      );
      // The fixture's weak-regime query reaches both legs, so agreement exists
      // to observe — otherwise this assertion would be vacuous.
      expect(both.length).toBeGreaterThan(0);
    }),
  );
});

describe('§6.5 the legs degrade on corpus faults and not on defects', () => {
  it.effect('propagates a defect rather than answering with an empty leg', () =>
    Effect.gen(function* () {
      // `Effect.catchCause` caught defects and interruption too, which turns a
      // real bug into "search found nothing" for the life of the process. A
      // defect must reach the caller.
      const broken = Layer.unwrap(
        Effect.gen(function* () {
          const paragraphs = yield* EGWParagraphDatabase;
          return SearchCorpusSources.wired({
            paragraphs: {
              ...paragraphs,
              searchScoredParagraphs: () => Effect.die(new Error('decoder blew up')),
            },
          });
        }),
      ).pipe(
        Layer.provide(
          EGWParagraphDatabase.Test({ books: GOLDEN_BOOKS, paragraphs: GOLDEN_PARAGRAPHS }),
        ),
      );
      const layer = SearchService.Live.pipe(
        Layer.provide(broken),
        Layer.provide(VectorIndexBytes.None),
      );
      const outcome = yield* Effect.exit(
        search({ text: 'what happens at the close of probation' }, layer),
      );
      expect(outcome._tag).toBe('Failure');
    }),
  );
});

describe('§9.2 scope', () => {
  it.effect('a pioneer-scoped query reaches pioneer paragraphs and has no vectors', () =>
    Effect.gen(function* () {
      // The index covers only the EGW/White-Estate partition, so `pioneer` is the
      // one scope with nothing to scan — and it must still search.
      const result = yield* search(
        { text: 'the king of the north shall come', scope: 'pioneer' },
        withIndex(),
      );
      expect(result.scope).toBe('pioneer');
      expect(result.vector._tag).toBe('unavailable');
      if (result.vector._tag !== 'unavailable') return;
      expect(result.vector.reason).toBe(absence('absent'));
      expect(result.paragraphs.every((hit) => hit.bookCode === 'DAR')).toBe(true);
    }),
  );

  it.effect('defaults to the EGW scope the index is pinned to', () =>
    Effect.gen(function* () {
      const result = yield* search({ text: 'what happens at the close of probation' }, withIndex());
      expect(result.scope).toBe('egw');
      expect(result.paragraphs.every((hit) => hit.bookCode !== 'DAR')).toBe(true);
    }),
  );
});

describe('§9.3 the locate-jump', () => {
  it.effect('routes a refcode and reports the route on the result', () =>
    Effect.gen(function* () {
      const result = yield* search({ text: 'GC 425' }, withIndex());
      expect(result.route).toBe('locate');
    }),
  );
});

describe('§9.7 the golden query set', () => {
  it.effect('routes every query the way §9.3 says, with the absence §9.6 says', () =>
    Effect.gen(function* () {
      // The set that the three clients run. Here it pins routing and fallback;
      // the CLI/RPC parity tests pin that the *identities* agree across seams.
      const layer = withIndex();
      for (const golden of GOLDEN_QUERIES) {
        const result = yield* queryWith(golden.query, layer);
        expect({ label: golden.label, route: result.route }).toEqual({
          label: golden.label,
          route: golden.route,
        });
        const observed = Match.value(result.vector).pipe(
          Match.tag('unavailable', (status) => Option.some(status.reason)),
          Match.orElse(() => Option.none<VectorAbsenceReason>()),
        );
        expect({ label: golden.label, absence: observed }).toEqual({
          label: golden.label,
          absence: golden.absence,
        });
      }
    }),
  );
});

describe('§9.7 the declared adapter tolerance', () => {
  test('accepts vectors that differ by at most one int8 step on a few axes', () => {
    const base = goldenVector('close of probation');
    const nudged = Int8Array.from(base);
    nudged[0] = (nudged[0] ?? 0) + 1;
    nudged[7] = (nudged[7] ?? 0) - 1;
    expect(vectorsAgree(base, nudged)).toBe(true);
  });

  test('rejects a vector that differs by more than one step anywhere', () => {
    const base = goldenVector('close of probation');
    const off = Int8Array.from(base);
    off[3] = (off[3] ?? 0) + 4;
    expect(vectorsAgree(base, off)).toBe(false);
  });

  test('rejects two vectors that differ by one step almost everywhere', () => {
    // The bound that makes the first one mean something: every component may
    // legitimately move by one, so "no component moved by more than one" is
    // satisfied by two vectors that agree nowhere.
    const base = goldenVector('close of probation');
    const drifted = Int8Array.from(base, (value, axis) => {
      if (axis % 4 === 0) return value;
      return Math.max(-127, Math.min(127, value + 1));
    });
    expect(vectorsAgree(base, drifted)).toBe(false);
  });

  test('rejects vectors of different lengths', () => {
    expect(vectorsAgree(new Int8Array(4), new Int8Array(8))).toBe(false);
  });
});
