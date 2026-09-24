import { describe, expect, test } from 'bun:test';
import { BunServices } from '@effect/platform-bun';
import { SqliteClient } from '@effect/sql-sqlite-bun';
import { Effect, Latch, Layer, Schedule } from 'effect';
import type { Scope } from 'effect';
import { Etag, HttpPlatform, HttpRouter } from 'effect/unstable/http';
import { HttpApiBuilder } from 'effect/unstable/httpapi';

import {
  loadVectorIndex,
  MODEL_FINGERPRINT,
  QueryEmbedder,
  VectorIndexBytes,
} from '@bible/core/search';
import {
  GOLDEN_TOPIC_QUERY,
  goldenSearchSources,
  goldenVector,
  goldenVectorIndexBytes,
} from '@bible/core/search/testing';

import { SearchApi } from './api.js';
import { SearchGroupLive } from './search-api.js';
import { lateVectorIndex } from './vector-index.js';

/**
 * The server answers before its vector index is read. The load is the real
 * `loadVectorIndex` over the golden index's bytes, and it waits on a latch
 * the test opens, so "while the index loads" is a state the test holds, not
 * a race it hopes to win.
 */

const embedder = Layer.succeed(
  QueryEmbedder,
  QueryEmbedder.of({
    fingerprint: MODEL_FINGERPRINT,
    embedQuery: (query: string) => Effect.succeed(goldenVector(query)),
    embedDocument: (text: string) => Effect.succeed(goldenVector(text)),
  }),
);

interface Health {
  readonly ok: boolean;
  readonly vector: string;
}

interface Searched {
  readonly vector: string;
  readonly hits: readonly unknown[];
}

/** The JSON API over the golden corpus. The index is read from `bytes`
 *  once `gate` opens. */
const serve = (gate: Latch.Latch, bytes: ArrayBuffer) =>
  Effect.gen(function* () {
    const search = lateVectorIndex(Effect.andThen(gate.await, loadVectorIndex)).pipe(
      Layer.provide(VectorIndexBytes.layerOf(bytes)),
      Layer.provide(goldenSearchSources),
      Layer.provide(embedder),
    );
    const { handler, dispose } = HttpRouter.toWebHandler(
      HttpApiBuilder.layer(SearchApi).pipe(
        Layer.provide(SearchGroupLive),
        Layer.provide(search),
        // The context lookup's connection; the golden corpus has no
        // neighbours to read, so no page asks it for any.
        Layer.provide(SqliteClient.layer({ filename: ':memory:' })),
        Layer.provide([Etag.layer, HttpPlatform.layer]),
        Layer.provide(BunServices.layer),
      ),
      { disableLogger: true },
    );
    yield* Effect.addFinalizer(() => Effect.promise(dispose));
    const get = <A>(path: string) =>
      Effect.gen(function* () {
        const response = yield* Effect.promise(() =>
          handler(new Request(`http://localhost${path}`)),
        );
        const body: A = yield* Effect.promise(() => response.json());
        return { status: response.status, body };
      });
    return {
      health: get<Health>('/health'),
      search: get<Searched>(
        `/api/search?q=${encodeURIComponent(GOLDEN_TOPIC_QUERY)}&scope=egw&context=0`,
      ),
    };
  });

/** Ask `/health` until the load has ended. The load's own fiber publishes
 *  the new service, so the test waits on what a platform healthcheck sees. */
const settled = (health: Effect.Effect<{ readonly body: Health }>) =>
  health.pipe(
    Effect.repeat({
      until: (answer) => answer.body.vector !== 'loading',
      schedule: Schedule.spaced('5 millis'),
      times: 400,
    }),
  );

const run = <A>(program: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(program));

describe('the vector index loads after the port opens', () => {
  test('health and search answer while the load is held, text-only', () =>
    run(
      Effect.gen(function* () {
        const gate = yield* Latch.make(false);
        const served = yield* serve(gate, goldenVectorIndexBytes());

        const health = yield* served.health;
        expect(health).toEqual({ status: 200, body: { ok: true, vector: 'loading' } });

        const searched = yield* served.search;
        expect(searched.status).toBe(200);
        expect(searched.body.vector).toBe('lexical — loading');
        expect(searched.body.hits.length).toBeGreaterThan(0);
      }),
    ));

  test('the same query is hybrid once the index has loaded, with no restart', () =>
    run(
      Effect.gen(function* () {
        const gate = yield* Latch.make(false);
        const served = yield* serve(gate, goldenVectorIndexBytes());
        expect((yield* served.search).body.vector).toBe('lexical — loading');

        yield* Latch.open(gate);

        expect((yield* settled(served.health)).body).toEqual({ ok: true, vector: 'ready' });
        expect((yield* served.search).body.vector).toBe('hybrid');
      }),
    ));

  test('an index the parser refuses ends the load text-only, and says why', () =>
    run(
      Effect.gen(function* () {
        const gate = yield* Latch.make(false);
        const served = yield* serve(gate, goldenVectorIndexBytes('another-model'));

        yield* Latch.open(gate);

        expect((yield* settled(served.health)).body).toEqual({ ok: true, vector: 'fingerprint' });
        expect((yield* served.search).body.vector).toBe('lexical — fingerprint');
      }),
    ));
});
