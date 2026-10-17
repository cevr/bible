import { describe, expect, test } from 'bun:test';
import { BunServices } from '@effect/platform-bun';
import { SqliteClient } from '@effect/sql-sqlite-bun';
import { Effect, Layer, Logger, Schema as S, Scope } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';

import { GOLDEN_TOPIC_QUERY, goldenSearchLayer } from '@bible/core/search/testing';
import { NO_SELECTION } from '@bible/core/writings';

import { SearchRequest, type SearchSlot } from '../api.js';
import { VectorIndexLoad } from '../vector-index.js';
import { searchRouter } from './router.ts';

/**
 * The Worker builds its router on the first request, inside that request's
 * fiber. These tests build it the same way and then ask it again, so a
 * router that kept anything of the first request answers the second wrong.
 */

const services = Layer.mergeAll(
  goldenSearchLayer(),
  Layer.succeed(VectorIndexLoad, VectorIndexLoad.of({ readiness: Effect.succeed('ready') })),
  SqliteClient.layer({ filename: ':memory:' }),
).pipe(Layer.orDie);

const store = { names: Effect.succeed([]), open: () => Effect.succeedNone };

const searching = (q: string): SearchRequest => ({
  q,
  scope: 'egw',
  section: NO_SELECTION,
  type: NO_SELECTION,
  subtype: NO_SELECTION,
  excludeApparatus: false,
  limit: 10,
  context: 0,
});

const batchBody = S.encodeSync(S.fromJsonString(S.Struct({ requests: S.Array(SearchRequest) })));

/** A POST to the batch endpoint, as the page sends one search. */
const batchRequest = (q: string) =>
  HttpServerRequest.fromWeb(
    new Request('http://localhost/api/search/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: batchBody({ requests: [searching(q)] }),
    }),
  );

/** The batch's one answer, a line per hit. */
const hitLines = (response: HttpServerResponse.HttpServerResponse) =>
  Effect.promise((): Promise<{ readonly results: readonly SearchSlot[] }> =>
    HttpServerResponse.toWeb(response).json(),
  ).pipe(
    Effect.map(({ results }) =>
      results.flatMap((slot) => {
        if (slot._tag === 'Failed') return [`failed: ${slot.message}`];
        return slot.response.hits.map((hit) => `${hit.bookCode} ${hit.text}`);
      }),
    ),
  );

/** The router built lazily, as the Worker builds it, and a search through
 *  it: the first search builds it. */
const lazyRouter = Effect.gen(function* () {
  const scope = yield* Scope.Scope;
  const context = yield* Layer.build(services);
  const app = yield* Effect.cached(searchRouter(context, store, scope));
  return (q: string) =>
    Effect.flatten(app).pipe(
      Effect.provideService(HttpServerRequest.HttpServerRequest, batchRequest(q)),
      Effect.flatMap(hitLines),
    );
});

const run = <A, E>(program: Effect.Effect<A, E, Scope.Scope | BunServices.BunServices>) =>
  Effect.runPromise(
    program.pipe(
      Effect.scoped,
      Effect.provide(Layer.mergeAll(BunServices.layer, Logger.layer([]))),
    ),
  );

describe('searchRouter built inside the first request', () => {
  test('a later POST is answered from its own body, not the first one', () =>
    run(
      Effect.gen(function* () {
        const search = yield* lazyRouter;
        const topic = yield* search(GOLDEN_TOPIC_QUERY);
        expect(topic.length).toBeGreaterThan(0);

        expect(yield* search('qqxzv')).toEqual([]);
        expect(yield* search(GOLDEN_TOPIC_QUERY)).toEqual(topic);
      }),
    ));

  test('a search after a first one that found nothing still finds its hits', () =>
    run(
      Effect.gen(function* () {
        const search = yield* lazyRouter;
        expect(yield* search('qqxzv')).toEqual([]);
        expect((yield* search(GOLDEN_TOPIC_QUERY)).length).toBeGreaterThan(0);
      }),
    ));
});
