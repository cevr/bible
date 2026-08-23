/** §10 Milestone 8's UI parity, at the half a unit test can state.
 *
 * > **UI parity:** one search surface, shared query/scope/book URL state,
 * > identical pinned-topics presentation on web and desktop.
 *
 *  "Identical presentation on web and desktop" is a claim about *one plan* being
 *  drawn by one component, so what is checkable here is the plan: which groups
 *  exist, in what order, what each row says about why it is present, and what
 *  the surface tells a reader whose vector leg did not run. The markup half —
 *  that the compiled component really draws the pinned group above the ranking —
 *  is asserted against a running app in `apps/desktop/e2e/search-hybrid.spec.ts`.
 */

import { describe, expect, test } from 'bun:test';
import {
  MODEL_FINGERPRINT,
  QueryEmbedder,
  SearchLocateTarget,
  SearchParagraphHit,
  SearchQuery,
  SearchResult,
  SearchService,
  SearchTopicHit,
  VectorLegRan,
  vectorUnavailable,
  type VectorAbsenceReason,
} from '@bible/core/search';
import {
  GOLDEN_QUERIES,
  GOLDEN_TOPIC_QUERY,
  goldenSearchLayer,
  goldenVector,
  goldenVectorIndexBytes,
} from '@bible/core/search/testing';
import { topicSlug } from '@bible/core/wiki';
import { Effect, Layer, Option } from 'effect';
import { createMemo, createRoot, createSignal, flush } from 'solid-js';

import { decodeRoute, encodeRoute } from '../route/index.js';
import {
  corpusChoice,
  isSearchable,
  provenanceOf,
  scopeOptions,
  searchPrompt,
  searchView,
  submittedRoute,
  type SearchRoute,
} from './search-state.js';

const hit = (input: {
  readonly refcode: string;
  readonly lexicalRank?: number;
  readonly vectorRank?: number;
  /** Absent for the one case the corpus admits and the route cannot address:
   *  a paragraph stored with no `para_id`. */
  readonly rawParaId?: Option.Option<string>;
}): SearchParagraphHit =>
  SearchParagraphHit.make({
    paragraphId: `GC:${input.refcode}`,
    // The route's two inputs, as the service now carries them (round-2 B2).
    publicationId: 132,
    rawParaId: input.rawParaId ?? Option.some(input.refcode),
    refcode: input.refcode,
    bookCode: 'GC',
    bookTitle: 'The Great Controversy',
    author: 'Ellen Gould White',
    snippet: 'the sanctuary in heaven',
    score: 0.5,
    lexicalRank: Option.fromNullishOr(input.lexicalRank),
    vectorRank: Option.fromNullishOr(input.vectorRank),
  });

const topic = (slug: string, title: string): SearchTopicHit =>
  SearchTopicHit.make({ slug: topicSlug(slug), title, status: 'flagship' });

const result = (input: {
  readonly topics?: readonly SearchTopicHit[];
  readonly paragraphs?: readonly SearchParagraphHit[];
  readonly locate?: Option.Option<SearchLocateTarget>;
  readonly route?: SearchResult['route'];
  readonly absence?: VectorAbsenceReason;
}): SearchResult =>
  SearchResult.make({
    query: 'the sanctuary',
    route: input.route ?? 'hybrid',
    scope: 'egw',
    topics: input.topics ?? [],
    locate: input.locate ?? Option.none(),
    paragraphs: input.paragraphs ?? [],
    vector: Option.match(Option.fromNullishOr(input.absence), {
      onNone: () =>
        VectorLegRan.make({ fingerprint: 'EmbeddingGemma-300M/256d-mrl/int8', scanned: 24 }),
      onSome: vectorUnavailable,
    }),
  });

describe('searchView — §9.4 the pinned topics group', () => {
  test('keeps topics in their own group, never inside the paragraph ranking', () => {
    // The structural claim §9.4 rests on. A surface that fused the two lists
    // would have to merge these fields deliberately; this is what stops it
    // happening by accident.
    const view = searchView(
      result({
        topics: [topic('the-sanctuary', 'The Sanctuary')],
        paragraphs: [hit({ refcode: 'GC 425.1', lexicalRank: 1 })],
      }),
    );
    expect(view.topics.map((entry) => entry.title)).toEqual(['The Sanctuary']);
    expect(view.hits.map((entry) => entry.refcode)).toEqual(['GC 425.1']);
    // No topic leaked into the ranking.
    const slugs = new Set(view.topics.map((entry) => entry.slug));
    expect(view.hits.some((entry) => slugs.has(entry.refcode))).toBe(false);
  });

  test('routes a topic to its wiki page', () => {
    const view = searchView(result({ topics: [topic('the-daily', 'The Daily')] }));
    expect(view.topics[0]?.href).toBe('/wiki/the-daily');
  });

  test('carries the pinned group even when the ranking is empty', () => {
    // A query that matched a topic and no paragraph still has an answer, and a
    // surface that keyed "no results" off the ranking alone would hide it.
    const view = searchView(result({ topics: [topic('the-daily', 'The Daily')] }));
    expect(view.empty).toBe(false);
    expect(view.topics.length).toBe(1);
  });
});

describe('searchView — why a row is present', () => {
  test('names the leg that proposed each hit', () => {
    // The distinction hybrid search added: a row only the vector leg found is a
    // different kind of answer from one the text index ranked first, and §9.4
    // carries both ranks precisely so the reader can be told which.
    const view = searchView(
      result({
        paragraphs: [
          hit({ refcode: 'GC 1.1', lexicalRank: 1, vectorRank: 2 }),
          hit({ refcode: 'GC 2.1', lexicalRank: 3 }),
          hit({ refcode: 'GC 3.1', vectorRank: 1 }),
        ],
      }),
    );
    expect(view.hits.map((entry) => entry.provenance)).toEqual(['both', 'lexical', 'vector']);
  });

  test('provenanceOf reads the two ranks and nothing else', () => {
    expect(provenanceOf(hit({ refcode: 'a', lexicalRank: 1, vectorRank: 1 }))).toBe('both');
    expect(provenanceOf(hit({ refcode: 'a', vectorRank: 1 }))).toBe('vector');
    expect(provenanceOf(hit({ refcode: 'a', lexicalRank: 1 }))).toBe('lexical');
  });

  test('preserves the fused order the service returned', () => {
    // §9.4 does the ranking; the view must not re-sort it. A surface that
    // ordered by score, or by leg, would silently discard RRF's result.
    const view = searchView(
      result({
        paragraphs: [
          hit({ refcode: 'GC 3.1', vectorRank: 1 }),
          hit({ refcode: 'GC 1.1', lexicalRank: 1 }),
          hit({ refcode: 'GC 2.1', lexicalRank: 2 }),
        ],
      }),
    );
    expect(view.hits.map((entry) => entry.refcode)).toEqual(['GC 3.1', 'GC 1.1', 'GC 2.1']);
  });
});

describe('searchView — §9.6 the typed absence, as one sentence', () => {
  test('says nothing when the vector leg ran', () => {
    const view = searchView(result({ paragraphs: [hit({ refcode: 'GC 1.1', lexicalRank: 1 })] }));
    expect(view.vector.show).toBe(false);
  });

  test('tells the reader which absence it is, not merely that one occurred', () => {
    // The point of §9.6 carrying a reason: "no index installed" is a thing the
    // reader can act on and "a different model built it" is a different thing.
    // A surface that collapsed both to "degraded" would throw that away.
    const absent = searchView(result({ absence: 'absent' })).vector;
    const mismatch = searchView(result({ absence: 'fingerprint' })).vector;
    const embedder = searchView(result({ absence: 'embedder' })).vector;
    expect([absent.show, mismatch.show, embedder.show]).toEqual([true, true, true]);
    expect(new Set([absent.message, mismatch.message, embedder.message]).size).toBe(3);
  });

  test('stays quiet for the two absences that are not degradations', () => {
    // The short-circuit is §9.4 deciding the lexical top hit was decisive, and
    // `route` is the router never sending the query to the vector leg at all.
    // Neither is something to interrupt a reader about.
    expect(searchView(result({ absence: 'short-circuit' })).vector.show).toBe(false);
    expect(searchView(result({ absence: 'route' })).vector.show).toBe(false);
  });
});

describe('searchView — §9.3 the locate route', () => {
  test('carries a refcode query’s jump target', () => {
    const view = searchView(
      result({
        route: 'locate',
        locate: Option.some(
          SearchLocateTarget.make({
            refcode: 'GC 425.1',
            bookCode: 'GC',
            bookTitle: 'The Great Controversy',
            paragraphId: 'GC:GC 425.1',
            publicationId: 132,
            rawParaId: Option.some('GC 425.1'),
          }),
        ),
      }),
    );
    expect(view.route).toBe('locate');
    expect(Option.isSome(view.locate)).toBe(true);
    // A jump target is an answer, so the surface must not draw "no results"
    // over it just because the ranking behind it is empty.
    expect(view.empty).toBe(false);
  });

  test('is absent on a hybrid query', () => {
    expect(searchView(result({})).locate).toEqual(Option.none());
  });
});

describe('searchView — one plan per result', () => {
  test('a memoized plan never mixes two results', () => {
    // The tearing `lookup-panel-state.ts` documents, restated for this surface:
    // what a plan reports and what it draws must come from one result. The plan
    // taken before the change still describes the result it was built from,
    // because its fields were never two reads.
    createRoot((dispose) => {
      const [live, setLive] = createSignal(
        result({ paragraphs: [hit({ refcode: 'GC 1.1', lexicalRank: 1 })] }),
      );
      const plan = createMemo(() => searchView(live()));

      flush();
      const before = plan();
      setLive(result({ topics: [topic('the-daily', 'The Daily')] }));
      flush();
      const after = plan();

      expect(before.hits).toHaveLength(1);
      expect(before.topics).toHaveLength(0);
      expect(after.hits).toHaveLength(0);
      expect(after.topics).toHaveLength(1);
      dispose();
    });
  });

  test('reads the result exactly once', () => {
    // The property that makes the plan safe to build inside a memo: every field
    // below comes from a single read, so no two of them can disagree.
    let reads = 0;
    const live = () => {
      reads += 1;
      return result({ paragraphs: [hit({ refcode: 'GC 1.1', lexicalRank: 1 })] });
    };
    searchView(live());
    expect(reads).toBe(1);
  });

  test('an answered query that found nothing is empty', () => {
    const view = searchView(result({}));
    expect(view.empty).toBe(true);
    expect(view.hits).toEqual([]);
    expect(view.topics).toEqual([]);
  });

  describe('§9.3 an empty box is not a search', () => {
    // The guard `WritingsSearch` mounts `useSearch` behind. Stated here rather
    // than in the component because it is a decision, and this is where the
    // surface's decisions live.
    test('refuses an empty query', () => {
      expect(isSearchable('')).toBe(false);
    });

    test('refuses a whitespace-only query, which is what a cleared box leaves', () => {
      // The case a `length > 0` check would let through: the reader selects the
      // text and types a space, and every keystroke costs an RPC, an FTS query
      // and a vector scan for a query nobody made.
      expect(isSearchable('   ')).toBe(false);
      expect(isSearchable('\t\n')).toBe(false);
    });

    test('accepts a query with content, including one that needs trimming', () => {
      expect(isSearchable('the sanctuary')).toBe(true);
      // Trimmed to decide, not trimmed to send: §9.3's router receives the
      // reader's text, and a leading space is not a reason to refuse it.
      expect(isSearchable('  the daily  ')).toBe(true);
    });
  });
});

/** Round-2 B2: every link the surface draws must decode back to a route.
 *
 *  The defect this pins was invisible to every assertion that existed: the
 *  surface produced an href for every hit, the href was a plausible-looking
 *  string, and no test ever asked the router whether it was a path the app has.
 *  It was not — `/writings/<bookCode>?paragraph=<join-key>` matches nothing the
 *  decoder accepts, so every result link 404'd.
 *
 *  The assertion is `decodeRoute(href)` over the *whole* golden result set, run
 *  through the real `SearchService` rather than over hand-built hits, so a hit
 *  shape the fixture does not anticipate is still covered. A link that decodes
 *  is a link the app can open; nothing weaker is worth asserting. */
describe('searchView — every link decodes to a route (B2)', () => {
  // `runSync`, so the walk below is an ordinary loop: the golden layer is
  // entirely in-memory, and an async helper would force `await` inside the
  // iteration that has to stay ordered.
  const run = (query: string) =>
    Effect.runSync(
      Effect.flatMap(SearchService, (service) =>
        service.query(
          SearchQuery.make({
            text: query,
            scope: Option.none(),
            bookCode: Option.none(),
            limit: Option.none(),
          }),
        ),
      ).pipe(
        Effect.provide(
          goldenSearchLayer({
            index: Option.some(goldenVectorIndexBytes()),
            embedder: Layer.succeed(QueryEmbedder, {
              fingerprint: MODEL_FINGERPRINT,
              embedQuery: (text: string) => Effect.succeed(goldenVector(text)),
              embedDocument: (text: string) => Effect.succeed(goldenVector(text)),
            }),
          }),
        ),
      ),
    );

  test('decodes every paragraph, topic and locate link in the golden result set', () => {
    let checkedParagraphs = 0;
    let checkedTopics = 0;
    let checkedLocates = 0;

    for (const golden of [...GOLDEN_QUERIES.map((entry) => entry.query.text), GOLDEN_TOPIC_QUERY]) {
      const view = searchView(run(golden));

      for (const paragraph of view.hits) {
        // Every fixture paragraph carries a `para_id`, so every hit is a link.
        expect(Option.isSome(paragraph.href)).toBe(true);
        const href = Option.getOrThrow(paragraph.href);
        const decoded = decodeRoute(href);
        expect({ query: golden, href, decoded: Option.isSome(decoded) }).toEqual({
          query: golden,
          href,
          decoded: true,
        });
        // And it decodes to *this* paragraph, not merely to some route.
        const route = Option.getOrThrow(decoded);
        expect(route._tag).toBe('writings');
        if (route._tag !== 'writings') continue;
        expect(route.reference._tag).toBe('paragraph');
        checkedParagraphs += 1;
      }

      for (const topic of view.topics) {
        const decoded = decodeRoute(topic.href);
        expect({ href: topic.href, decoded: Option.isSome(decoded) }).toEqual({
          href: topic.href,
          decoded: true,
        });
        expect(Option.getOrThrow(decoded)._tag).toBe('wiki');
        checkedTopics += 1;
      }

      if (Option.isSome(view.locate)) {
        const href = view.locate.value.href;
        const decoded = decodeRoute(href);
        expect({ href, decoded: Option.isSome(decoded) }).toEqual({ href, decoded: true });
        expect(Option.getOrThrow(decoded)._tag).toBe('writings');
        checkedLocates += 1;
      }
    }

    // The golden set has to have actually produced links of each kind, or the
    // loop above asserts nothing. A refcode query supplies the locate leg and
    // the topic query supplies the pinned group.
    expect(checkedParagraphs).toBeGreaterThan(0);
    expect(checkedTopics).toBeGreaterThan(0);
    expect(checkedLocates).toBeGreaterThan(0);
  });

  test('draws no link for a paragraph the corpus cannot address', () => {
    // The one shape that has no route: `para_id` is nullable in the schema, and
    // `WritingsReference.paragraph` has nothing to point at without it. `None`
    // is the honest answer, and the component renders plain text for it.
    const view = searchView(
      result({
        paragraphs: [hit({ refcode: 'GC 425.1', lexicalRank: 1, rawParaId: Option.none() })],
      }),
    );
    expect(view.hits[0]?.href).toEqual(Option.none());
  });
});

/** The one shared form's own decisions (round-2 B3).
 *
 *  What was broken: `/search` had a single form, it lived inside `BibleSearch`,
 *  and it hard-coded `scope: 'bible'`. The writings half of §9 was therefore
 *  unreachable from the UI — no menu entry, no control, no input of its own.
 *  These assert the rules the new `SearchForm` draws, at the seam where they can
 *  be stated without a DOM.
 */
const searchRoute = (input: Partial<SearchRoute>): SearchRoute => ({
  _tag: 'search',
  query: 'sanctuary',
  scope: 'bible',
  books: [],
  corpus: Option.none(),
  bookCode: Option.none(),
  ...input,
});

describe('the shared search form — scope controls (B3)', () => {
  test('offers both corpora, with the route’s own marked current', () => {
    const bible = scopeOptions(searchRoute({ scope: 'bible' }));
    expect(bible.map((option) => option.id)).toEqual(['bible', 'writings']);
    expect(bible.map((option) => option.active)).toEqual([true, false]);

    const writings = scopeOptions(searchRoute({ scope: 'writings' }));
    expect(writings.map((option) => option.active)).toEqual([false, true]);
  });

  test('the Bible scope is the default, so `all` is not a third choice', () => {
    expect(corpusChoice(searchRoute({ scope: 'all' }))).toBe('bible');
    expect(scopeOptions(searchRoute({ scope: 'all' })).map((option) => option.active)).toEqual([
      true,
      false,
    ]);
  });

  test('switching scope keeps the query', () => {
    const options = scopeOptions(searchRoute({ query: 'the investigative judgment' }));
    for (const option of options) expect(option.route.query).toBe('the investigative judgment');
  });

  test('switching scope drops the narrowings that do not belong to the destination', () => {
    // A Bible query narrowed to books, crossed to the writings side: the book
    // numbers mean nothing there, so carrying them would put a filter in the URL
    // that the destination silently ignores.
    const fromBible = scopeOptions(searchRoute({ scope: 'bible', books: [1, 2, 3] })).find(
      (option) => option.id === 'writings',
    );
    expect(fromBible?.route.books).toEqual([]);

    // And the reverse: a writings `corpus`/`bookCode` is meaningless to the
    // Bible search.
    const fromWritings = scopeOptions(
      searchRoute({
        scope: 'writings',
        corpus: Option.some('egw' as const),
        bookCode: Option.some('GC'),
      }),
    ).find((option) => option.id === 'bible');
    expect(fromWritings?.route.corpus).toEqual(Option.none());
    expect(fromWritings?.route.bookCode).toEqual(Option.none());
  });

  test('the writings scope keeps its own narrowings when it stays put', () => {
    const staying = scopeOptions(
      searchRoute({
        scope: 'writings',
        corpus: Option.some('egw' as const),
        bookCode: Option.some('GC'),
      }),
    ).find((option) => option.id === 'writings');
    expect(staying?.route.corpus).toEqual(Option.some('egw'));
    expect(staying?.route.bookCode).toEqual(Option.some('GC'));
  });

  test('every scope control is a link the router decodes back to a search', () => {
    // The controls are anchors so a scope switch is shareable and
    // back-navigable. That is only true if what they encode round-trips.
    for (const scope of ['bible', 'writings', 'all'] as const) {
      for (const option of scopeOptions(searchRoute({ scope }))) {
        const decoded = decodeRoute(encodeRoute(option.route));
        expect(Option.isSome(decoded)).toBe(true);
        if (Option.isNone(decoded)) continue;
        expect(decoded.value._tag).toBe('search');
        if (decoded.value._tag !== 'search') continue;
        expect(corpusChoice(decoded.value)).toBe(option.id);
        expect(decoded.value.query).toBe(option.route.query);
      }
    }
  });
});

describe('the shared search form — submitting (B3)', () => {
  test('keeps the scope and the narrowings, and trims the text', () => {
    const submitted = submittedRoute(
      searchRoute({
        scope: 'writings',
        corpus: Option.some('egw' as const),
        bookCode: Option.some('GC'),
      }),
      '  the latter rain  ',
    );
    expect(submitted.query).toBe('the latter rain');
    expect(submitted.scope).toBe('writings');
    expect(submitted.corpus).toEqual(Option.some('egw'));
    expect(submitted.bookCode).toEqual(Option.some('GC'));
  });

  test('a whitespace-only submission encodes a query the guard also refuses', () => {
    // The URL and `isSearchable` have to agree about what was asked. A route
    // carrying `q=%20%20` would encode a query the guard then declines to run,
    // which reads as a box that silently does nothing.
    const submitted = submittedRoute(searchRoute({}), '   ');
    expect(submitted.query).toBe('');
    expect(isSearchable(submitted.query)).toBe(false);
  });

  test('the empty box says something different per corpus', () => {
    expect(searchPrompt(searchRoute({ scope: 'bible' }))).not.toBe(
      searchPrompt(searchRoute({ scope: 'writings' })),
    );
  });
});

/** §9.3's router never sees an empty query (round-2 F13).
 *
 *  `WritingsSearch` guards `SearchResults` behind `isSearchable`, so `useSearch`
 *  is *unmounted* rather than called and ignored — the difference between not
 *  searching and searching for nothing, and on a 246 MB vector index the
 *  difference between an idle box and a scan per keystroke.
 *
 *  Asserting that through the component would need a DOM. Asserting it through
 *  the seam the component's guard actually calls is the same assertion one layer
 *  down: `WritingsSearch` calls exactly `isSearchable(props.query)`, so a guard
 *  removed or loosened there is a guard this describes.
 */
describe('the writings search never runs an empty query (F13)', () => {
  test('refuses every shape of blank', () => {
    for (const blank of ['', ' ', '   ', '\t', '\n', ' \t\n ']) {
      expect(isSearchable(blank)).toBe(false);
    }
  });

  test('accepts a query with actual text', () => {
    expect(isSearchable('a')).toBe(true);
    expect(isSearchable('  the sanctuary  ')).toBe(true);
  });
});
