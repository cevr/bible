import { describe, expect, test } from 'bun:test';
import { SqliteClient } from '@effect/sql-sqlite-bun';
import { ActorHost, ActorTransport } from 'effect-frame/actor';
import { Effect, Layer, Option, Schema } from 'effect';
import { SqlClient } from 'effect/unstable/sql';

import {
  SearchParagraphHit,
  SearchResult,
  SearchService,
  VectorIndexUnavailable,
} from '@bible/core/search';

import { Search, type SearchRequest } from '../src/contract.js';
import { PoliciesLive } from './policies.js';
import { runSearch, SearchLive } from './search.js';

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
  readonly calls: { value: number };
  readonly layer: Layer.Layer<ActorTransport | SearchService | SqlClient.SqlClient>;
}

const makeFixture = (): Fixture => {
  const calls = { value: 0 };
  const sqlite = SqliteClient.layer({ filename: ':memory:' });
  const countedSql = Layer.effect(
    SqlClient.SqlClient,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      return new Proxy(sql, {
        apply(target, thisArg, args) {
          calls.value += 1;
          return Reflect.apply(target, thisArg, args);
        },
      });
    }),
  ).pipe(Layer.provide(sqlite));
  const layer = ActorHost.layer({
    implementations: [],
    queries: [SearchLive],
    store: ActorHost.memoryStore,
  }).pipe(
    Layer.provideMerge(Layer.merge(searchLayer, countedSql)),
    Layer.provide(PoliciesLive),
    Layer.orDie,
  );
  return { calls, layer };
};

const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<A, E, ActorTransport | SearchService | SqlClient.SqlClient>,
) => program.pipe(Effect.provide(fixture.layer), Effect.scoped, Effect.runPromise);

const keyFor = (request: SearchRequest) => ({
  query: Search.name,
  version: Search.version,
  args: Schema.encodeSync(Search.args)(request),
});

const resultFor = (encoded: string) => Schema.decodeSync(Search.result)(encoded);

describe('batched EGW search', () => {
  test('matches separate legacy searches and shares same-radius context lookup', () => {
    const fixture = makeFixture();
    return run(
      fixture,
      Effect.gen(function* () {
        yield* seed;
        const first = request('first', 3);
        const second = request('second', 3);
        fixture.calls.value = 0;

        const legacy = yield* Effect.all([runSearch(first), runSearch(second)]);
        expect(fixture.calls.value).toBe(2);

        fixture.calls.value = 0;
        const transport = yield* ActorTransport;
        const batch = yield* transport.queryBatch([keyFor(first), keyFor(second)]);

        expect(fixture.calls.value).toBe(1);
        expect(batch.map((result) => result._tag)).toEqual(['Refreshed', 'Refreshed']);
        const batched = batch.flatMap((result) => {
          if (result._tag !== 'Refreshed') return [];
          return [resultFor(result.result)];
        });
        expect(batched).toEqual(legacy);
      }),
    );
  });

  test('keeps a successful input when a neighboring input fails', () => {
    const fixture = makeFixture();
    return run(
      fixture,
      Effect.gen(function* () {
        yield* seed;
        const failed = request('bad input', 3);
        const successful = request('first', 3);
        const transport = yield* ActorTransport;
        const batch = yield* transport.queryBatch([keyFor(failed), keyFor(successful)]);

        expect(batch.map((result) => result._tag)).toEqual(['RefreshFailed', 'Refreshed']);
        const failure = batch[0];
        const success = batch[1];
        if (failure?._tag === 'RefreshFailed') {
          expect(failure.error._tag).toBe('QueryFailed');
        }
        if (success?._tag === 'Refreshed') {
          expect(resultFor(success.result).hits[0]?.text).toBe('first');
        }
      }),
    );
  });

  test('groups mixed radii separately and preserves each response context', () => {
    const fixture = makeFixture();
    return run(
      fixture,
      Effect.gen(function* () {
        yield* seed;
        const near = request('first', 1);
        const far = request('second', 3);
        const transport = yield* ActorTransport;
        const batch = yield* transport.queryBatch([keyFor(near), keyFor(far)]);

        expect(fixture.calls.value).toBe(2);
        expect(batch.map((result) => result._tag)).toEqual(['Refreshed', 'Refreshed']);
        const nearSlot = batch[0];
        const farSlot = batch[1];
        if (nearSlot?._tag !== 'Refreshed' || farSlot?._tag !== 'Refreshed') return;
        const [nearResult, farResult] = [resultFor(nearSlot.result), resultFor(farSlot.result)];
        expect(nearResult.hits[0]?.before.map((row) => row.text)).toEqual(['before first']);
        expect(farResult.hits[0]?.before.map((row) => row.text)).toEqual([
          'after first',
          'before two far',
          'before two near',
        ]);
        expect(farResult.hits[0]?.after.map((row) => row.text)).toEqual([
          'after two near',
          'after two far',
        ]);
      }),
    );
  });
});
