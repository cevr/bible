import { describe, expect, test } from 'bun:test';
import { SqliteClient } from '@effect/sql-sqlite-bun';
import { Effect, Layer, Option } from 'effect';
import { SqlClient } from 'effect/unstable/sql';

import {
  SearchParagraphHit,
  SearchResult,
  SearchService,
  VectorIndexUnavailable,
} from '@bible/core/search';

import type { SearchRequest, SearchResponse, SearchSlot } from './api.js';
import { surroundingParagraphs } from './context.js';
import { runSearch, runSearchBatchWith } from './search.js';

const emptySelection = { include: [], exclude: [] } as const;

const request = (q: string, context: number): SearchRequest => ({
  q,
  scope: 'all',
  section: emptySelection,
  type: emptySelection,
  subtype: emptySelection,
  excludeApparatus: false,
  limit: 40,
  context,
});

const hitFor = (anchor: string, text: string) =>
  SearchParagraphHit.make({
    paragraphId: `paragraph-${anchor}`,
    publicationId: 1,
    rawParaId: Option.some(anchor),
    refcode: Option.some(`${anchor}.1`),
    bookCode: 'GC',
    bookTitle: 'The Great Controversy',
    author: 'Ellen White',
    snippet: text,
    isHeading: false,
    backMatter: false,
    score: 1,
    lexicalRank: Option.some(1),
    vectorRank: Option.none(),
  });

const searchLayer = Layer.succeed(
  SearchService,
  SearchService.of({
    query: (input) => {
      if (input.text === 'bad input') return Effect.die('fixture search failure');
      if (input.text === 'first') {
        return Effect.succeed(
          SearchResult.make({
            query: input.text,
            route: 'hybrid',
            scope: 'all',
            locate: Option.none(),
            paragraphs: [hitFor('anchor-one', input.text)],
            vector: VectorIndexUnavailable.make({ reason: 'absent' }),
            nonSelective: false,
          }),
        );
      }
      return Effect.succeed(
        SearchResult.make({
          query: input.text,
          route: 'hybrid',
          scope: 'all',
          locate: Option.none(),
          paragraphs: [hitFor('anchor-two', input.text)],
          vector: VectorIndexUnavailable.make({ reason: 'absent' }),
          nonSelective: false,
        }),
      );
    },
  }),
);

const seed = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql.unsafe(`
    create table paragraphs (
      para_id text,
      book_id integer not null,
      puborder integer not null,
      refcode_short text,
      content_text text not null,
      is_chapter_heading integer not null
    )
  `);
  yield* sql.unsafe(`
    insert into paragraphs (para_id, book_id, puborder, refcode_short, content_text, is_chapter_heading)
    values
      ('before-one', 1, 1, 'GC 1.1', 'before first', 0),
      ('anchor-one', 1, 2, 'GC 1.2', 'first', 0),
      ('after-one', 1, 3, 'GC 1.3', 'after first', 0),
      ('before-two-far', 1, 4, 'GC 1.4', 'before two far', 0),
      ('before-two-near', 1, 5, 'GC 1.5', 'before two near', 0),
      ('anchor-two', 1, 6, 'GC 1.6', 'second', 0),
      ('after-two-near', 1, 7, 'GC 1.7', 'after two near', 0),
      ('after-two-far', 1, 8, 'GC 1.8', 'after two far', 0)
  `);
});

interface Fixture {
  /** Context statements run, counted at the lookup. */
  readonly calls: { value: number };
  readonly layer: Layer.Layer<SearchService | SqlClient.SqlClient>;
}

const makeFixture = (): Fixture => {
  const calls = { value: 0 };
  const layer = Layer.merge(searchLayer, SqliteClient.layer({ filename: ':memory:' }));
  return { calls, layer };
};

const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<A, E, SearchService | SqlClient.SqlClient>,
) => program.pipe(Effect.provide(fixture.layer), Effect.runPromise);

/** The batch pipeline over the real lookup, counting each context read. */
const batch = (fixture: Fixture, requests: readonly SearchRequest[]) =>
  runSearchBatchWith(requests, (anchors, radius) => {
    fixture.calls.value += 1;
    return surroundingParagraphs(anchors, radius);
  });

const answered = (slot: SearchSlot): SearchResponse => {
  if (slot._tag === 'Answered') return slot.response;
  return expect.unreachable(`expected an answer, got: ${slot.message}`);
};

describe('batched EGW search', () => {
  test('matches separate searches and shares one same-radius context lookup', () => {
    const fixture = makeFixture();
    return run(
      fixture,
      Effect.gen(function* () {
        yield* seed;
        const first = request('first', 3);
        const second = request('second', 3);
        const single = yield* Effect.all([runSearch(first), runSearch(second)]);

        fixture.calls.value = 0;
        const slots = yield* batch(fixture, [first, second]);

        expect(fixture.calls.value).toBe(1);
        expect(slots.map((slot) => slot._tag)).toEqual(['Answered', 'Answered']);
        expect(slots.map(answered)).toEqual(single);
      }),
    );
  });

  test('keeps a successful input when a neighboring input fails', () => {
    const fixture = makeFixture();
    return run(
      fixture,
      Effect.gen(function* () {
        yield* seed;
        const slots = yield* batch(fixture, [request('bad input', 3), request('first', 3)]);

        expect(slots.map((slot) => slot._tag)).toEqual(['Failed', 'Answered']);
        expect(slots.slice(1).map(answered)[0]?.hits[0]?.text).toBe('first');
      }),
    );
  });

  test('answers an empty query as idle without reading context', () => {
    const fixture = makeFixture();
    return run(
      fixture,
      Effect.gen(function* () {
        yield* seed;
        const slots = yield* batch(fixture, [request('   ', 3)]);

        expect(fixture.calls.value).toBe(0);
        expect(slots.map(answered)).toEqual([
          {
            hits: [],
            scope: 'all',
            vector: 'idle',
            nonSelective: false,
          },
        ]);
      }),
    );
  });

  test('groups mixed radii separately and preserves each response context', () => {
    const fixture = makeFixture();
    return run(
      fixture,
      Effect.gen(function* () {
        yield* seed;
        const slots = yield* batch(fixture, [request('first', 1), request('second', 3)]);

        expect(fixture.calls.value).toBe(2);
        const contexts = slots.map(answered).map((response) => ({
          before: response.hits[0]?.before.map((row) => row.text),
          after: response.hits[0]?.after.map((row) => row.text),
        }));
        expect(contexts).toEqual([
          { before: ['before first'], after: ['after first'] },
          {
            before: ['after first', 'before two far', 'before two near'],
            after: ['after two near', 'after two far'],
          },
        ]);
      }),
    );
  });
});
