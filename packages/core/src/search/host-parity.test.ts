/** §9.7's acceptance, at the seam it is actually checkable at.
 *
 *  "Ordered result identities and fallback behavior must match" across web,
 *  desktop and CLI. Those three reach `SearchService` two ways — the two visual
 *  hosts over `v1.search.query`, the CLI by calling the service directly — and
 *  this file proves the two ways produce one value, encoded by one codec.
 *
 *  What it deliberately does *not* do is compare a hand-written expected list.
 *  §9.7 is an agreement property, and the strongest way to state it is that the
 *  two seams' encoded bytes are equal — which fails if either side gains a
 *  field, drops one, or orders them differently, without this file having to
 *  enumerate what the fields are. That is the same argument
 *  `wiki/host-parity.test.ts` makes for the composed page. */

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option, Schema } from 'effect';
import { RpcTest } from 'effect/unstable/rpc';

import { BibleProcedureGroup } from '../procedure/group.js';
import { BibleProcedureHandlers } from '../procedure/handlers.js';
import { procedureDependencies } from '../procedure/testing.js';
import { QueryEmbedder } from './embedder.js';
import {
  goldenSearchLayer,
  goldenVector,
  goldenVectorIndexBytes,
  GOLDEN_QUERIES,
  GOLDEN_TOPIC_QUERY,
  GOLDEN_TOPIC_SLUG,
} from './golden-fixture.js';
import { SearchQuery, SearchResultJson } from './model.js';
import { SearchService } from './service.js';
import { MODEL_FINGERPRINT } from './vector-index.js';

const embedder = Layer.succeed(QueryEmbedder, {
  fingerprint: MODEL_FINGERPRINT,
  embedQuery: (query: string) => Effect.succeed(goldenVector(query)),
  embedDocument: (text: string) => Effect.succeed(goldenVector(text)),
});

/** One `SearchService` instance, shared by both seams.
 *
 *  The same layer value on purpose: §9.7 is about the *seams* agreeing, and
 *  giving each seam its own service instance would let a difference in service
 *  construction hide behind a difference the test was not looking for. */
const searchLayer: Layer.Layer<SearchService> = goldenSearchLayer({
  index: Option.some(goldenVectorIndexBytes()),
  embedder,
});

const encode = Schema.encodeEffect(Schema.fromJsonString(SearchResultJson));

/** The value `v1.search.query` puts on the wire. `RpcTest` runs the real
 *  client/server pair, so this has crossed a wire and been decoded by the
 *  group's own schema. */
const overRpc = (query: SearchQuery) =>
  Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(BibleProcedureGroup);
    return yield* client['v1.search.query']({
      text: query.text,
      scope: Option.getOrUndefined(query.scope),
      bookCode: Option.getOrUndefined(query.bookCode),
      limit: Option.getOrUndefined(query.limit),
    });
  }).pipe(
    Effect.provide(
      BibleProcedureHandlers.pipe(Layer.provide(procedureDependencies({ search: searchLayer }))),
    ),
  );

/** The value the CLI gets, calling `SearchService` directly. */
const overCli = (query: SearchQuery) =>
  Effect.flatMap(SearchService, (service) => service.query(query)).pipe(
    Effect.provide(searchLayer),
  );

describe('§9.7 search host parity', () => {
  it.scopedLive('the RPC handler and the CLI serialize the identical result', () =>
    Effect.gen(function* () {
      const query = SearchQuery.make({
        text: 'what happens at the close of probation',
        scope: Option.none(),
        bookCode: Option.none(),
        limit: Option.none(),
      });
      const wire = yield* overRpc(query);
      const direct = yield* overCli(query);

      expect(yield* encode(wire)).toBe(yield* encode(direct));

      // Not vacuous: the fixture query reaches the vector leg and returns rows,
      // so an implementation that answered nothing would satisfy the equality
      // above and fail here.
      expect(direct.paragraphs.length).toBeGreaterThan(0);
      expect(direct.vector._tag).toBe('ran');
    }),
  );

  it.scopedLive('every golden query agrees across both seams', () =>
    Effect.gen(function* () {
      // §9.7's whole set, at the one seam where "the same fixture in all three
      // clients" is provable inside core. The host round-trip suites in
      // `apps/web` and `apps/desktop` carry the same set over their real
      // transports.
      for (const golden of GOLDEN_QUERIES) {
        const wire = yield* overRpc(golden.query);
        const direct = yield* overCli(golden.query);
        expect({ label: golden.label, json: yield* encode(wire) }).toEqual({
          label: golden.label,
          json: yield* encode(direct),
        });
      }
    }),
  );

  it.scopedLive('the typed absence survives the wire', () =>
    Effect.gen(function* () {
      // §9.6's requirement that the absence be "the same typed value in all
      // three clients". A reason that decoded to a bare string, or an absence
      // that flattened to a boolean at the boundary, would fail here.
      const query = SearchQuery.make({
        text: 'what happens at the close of probation',
        scope: Option.none(),
        bookCode: Option.none(),
        limit: Option.none(),
      });
      const absent = goldenSearchLayer({ index: Option.none() });
      const wire = yield* Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(BibleProcedureGroup);
        return yield* client['v1.search.query']({ text: query.text });
      }).pipe(
        Effect.provide(
          BibleProcedureHandlers.pipe(Layer.provide(procedureDependencies({ search: absent }))),
        ),
      );
      expect(wire.vector._tag).toBe('unavailable');
      if (wire.vector._tag !== 'unavailable') return;
      expect(wire.vector.reason).toBe('absent');
      expect(wire.paragraphs.length).toBeGreaterThan(0);
    }),
  );

  it.scopedLive('the pinned topic survives the wire at its exact position', () =>
    Effect.gen(function* () {
      // §9.4 across the seam, and the regression test for the defect that hid
      // here: the fixture's catalog reached the CLI seam and an *empty* catalog
      // reached the RPC seam, because `SearchCorpusSources` had captured
      // whichever `WikiService` the surrounding graph memoized first. Both seams
      // are asserted, because the bug was invisible to either one alone.
      const query = SearchQuery.make({
        text: GOLDEN_TOPIC_QUERY,
        scope: Option.none(),
        bookCode: Option.none(),
        limit: Option.none(),
      });
      const wire = yield* overRpc(query);
      const direct = yield* overCli(query);

      for (const [seam, result] of [
        ['rpc', wire],
        ['cli', direct],
      ] as const) {
        // Exact position, not mere presence: a pinned group is an identity
        // answer, so the topic is the whole list and it is first.
        expect({ seam, slugs: result.topics.map((topic) => topic.slug) }).toEqual({
          seam,
          slugs: [GOLDEN_TOPIC_SLUG],
        });
        // §9.4's structural claim: the topic is pinned *above* the ranking, so
        // it must never also appear as a paragraph row.
        expect({
          seam,
          leaked: result.paragraphs.some((row) => row.paragraphId === GOLDEN_TOPIC_SLUG),
        }).toEqual({ seam, leaked: false });
      }
    }),
  );

  it.scopedLive('the pinned topics group is its own field on the wire', () =>
    Effect.gen(function* () {
      // §9.4's structural claim, asserted against the encoded shape rather than
      // the in-memory value: a client reading this JSON cannot find a topic
      // inside `paragraphs`, because the two are different keys.
      const wire = yield* overRpc(
        SearchQuery.make({
          text: 'what happens at the close of probation',
          scope: Option.none(),
          bookCode: Option.none(),
          limit: Option.none(),
        }),
      );
      const json = yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(
        yield* encode(wire),
      );
      expect(Object.keys(json as object)).toEqual([
        'query',
        'route',
        'scope',
        'topics',
        'locate',
        'paragraphs',
        'vector',
      ]);
    }),
  );
});
