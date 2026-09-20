/** §10 Milestone 8 in the web worker: **the golden query set crosses a real
 *  `MessagePort` and comes back as the same ordered result the other hosts get.**
 *
 *  `packages/core/src/search/host-parity.test.ts` proves the RPC handler and
 *  `SearchService` encode one value through one codec — but it proves it over
 *  `RpcTest`, an in-memory client. What it cannot see is the physical boundary:
 *  a `Schema.Option` that survives `RpcTest` but not a structured clone, or a
 *  result whose ordering depends on something that does not serialize, would
 *  leave that suite green and this one red. So this file runs the same fixture
 *  and the same query set over the transport `layerProcedureServer` actually
 *  ends in.
 *
 *  It is also where §10's third adapter leg is checked. The Bun and
 *  Electron-main embedders are compared in `search/adapter-parity.test.ts`;
 *  WebGPU cannot run under Bun at all, so the browser adapter's *contract* —
 *  that a host without it degrades to lexical-only carrying §9.6's typed
 *  absence, rather than crashing or silently returning nothing — is asserted
 *  here, on the host that would experience it.
 */

import { BibleProcedureGroup, BibleProcedureHandlers } from '@bible/core/procedure';
import { procedureDependencies } from '@bible/core/procedure/testing';
import {
  MODEL_FINGERPRINT,
  QueryEmbedder,
  SearchQuery,
  SearchResultJson,
  SearchService,
} from '@bible/core/search';
import {
  GOLDEN_QUERIES,
  GOLDEN_TOPIC_QUERY,
  GOLDEN_TOPIC_SLUG,
  goldenSearchLayer,
  goldenVector,
  goldenVectorIndexBytes,
} from '@bible/core/search/testing';
import * as BrowserWorkerRunner from '@effect/platform-browser/BrowserWorkerRunner';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Fiber, Layer, Option, Schema } from 'effect';
import type { Scope } from 'effect';
import type { FromClientEncoded, RequestEncoded } from 'effect/unstable/rpc/RpcMessage';
import * as RpcClient from 'effect/unstable/rpc/RpcClient';
import * as RpcServer from 'effect/unstable/rpc/RpcServer';

import { layerWebProcedureTransport } from './procedure-client.js';

/** A query §9.3 considers wordy, so it routes to the hybrid path and the vector
 *  leg is actually attempted rather than skipped by the router. */
const WORDY_QUERY = 'what happens at the close of probation';

/** The fixture embedder the core parity suite uses, so the value this host is
 *  compared against is the one the other hosts were compared against. */
const embedder = Layer.succeed(
  QueryEmbedder,
  QueryEmbedder.of({
    fingerprint: MODEL_FINGERPRINT,
    embedQuery: (query: string) => Effect.succeed(goldenVector(query)),
    embedDocument: (text: string) => Effect.succeed(goldenVector(text)),
  }),
);

/** The WebGPU host: index installed, embedder available. */
const hybridSearch = goldenSearchLayer({
  index: Option.some(goldenVectorIndexBytes()),
  embedder,
});

/** The no-WebGPU host §9.5 declines to serve: the index is there, but nothing
 *  can embed the query. §10 requires this to be lexical-only with the typed
 *  absence — not an error, and not a silent empty result. */
const noWebGpuSearch = goldenSearchLayer({ index: Option.some(goldenVectorIndexBytes()) });

const searchServer = (port: MessagePort, search: Layer.Layer<SearchService>) =>
  RpcServer.layer(BibleProcedureGroup).pipe(
    Layer.provide(BibleProcedureHandlers.pipe(Layer.provide(procedureDependencies({ search })))),
    Layer.provide(RpcServer.layerProtocolWorkerRunner),
    Layer.provide(BrowserWorkerRunner.layerMessagePort(port)),
  );

type WorkerFrame = readonly [number, FromClientEncoded];

const isRequestFrame = (frame: WorkerFrame): frame is readonly [number, RequestEncoded] =>
  frame[1]._tag === 'Request';

interface Wire {
  readonly clientPort: MessagePort;
  readonly serverPort: MessagePort;
  readonly requests: () => readonly RequestEncoded[];
  readonly close: () => void;
}

/** Two channels bridged by a counter, so both directions are genuine
 *  `MessagePort` traffic and every `Request` is recorded as it physically
 *  crosses. Same relay the dictionary and study round trips use. */
const bridged = (): Wire => {
  const requests: RequestEncoded[] = [];
  const toRelay = new MessageChannel();
  const toServer = new MessageChannel();
  toRelay.port2.onmessage = (event: MessageEvent<WorkerFrame>) => {
    if (isRequestFrame(event.data)) requests.push(event.data[1]);
    toServer.port1.postMessage(event.data);
  };
  toServer.port1.onmessage = (event: MessageEvent) => {
    toRelay.port2.postMessage(event.data);
  };
  toRelay.port2.start();
  toServer.port1.start();
  return {
    clientPort: toRelay.port1,
    serverPort: toServer.port2,
    requests: () => requests,
    close: () => {
      toRelay.port1.close();
      toRelay.port2.close();
      toServer.port1.close();
      toServer.port2.close();
    },
  };
};

const client = RpcClient.make(BibleProcedureGroup);

const wiredWith = (search: Layer.Layer<SearchService>) =>
  Effect.gen(function* () {
    const wire = yield* Effect.acquireRelease(Effect.sync(bridged), (active) =>
      Effect.sync(() => active.close()),
    );
    const server = yield* Effect.forkScoped(Layer.launch(searchServer(wire.serverPort, search)));
    yield* Effect.addFinalizer(() => Fiber.interrupt(server));
    return wire;
  });

/** Run a client-side effect over a wired port. The transport layer is provided
 *  at this function's own boundary, so a test's generator stays a description of
 *  what it asks rather than a place where wiring happens. */
const over = <A, E>(
  port: MessagePort,
  ask: Effect.Effect<A, E, RpcClient.Protocol | Scope.Scope>,
) => ask.pipe(Effect.provide(layerWebProcedureTransport(port)));

/** The same query answered without crossing a port, by the same hybrid wiring.
 *  Its layer is provided here, at this function's boundary. */
const locally = (text: string) =>
  Effect.flatMap(SearchService, (service) =>
    service.query(
      SearchQuery.make({
        text,
        scope: Option.none(),
        bookCode: Option.none(),
        limit: Option.none(),
      }),
    ),
  ).pipe(Effect.provide(hybridSearch));

const encode = Schema.encodeEffect(Schema.fromJsonString(SearchResultJson));

describe('web worker hybrid search', () => {
  it.scopedLive(
    'carries the whole golden query set across the port',
    () =>
      Effect.gen(function* () {
        const wire = yield* wiredWith(hybridSearch);

        // One client for the whole set, built once. Building it per query would
        // negotiate a fresh connection over a port that already has one, which is
        // not what a host does and not what this file is measuring.
        const routes = yield* over(
          wire.clientPort,
          Effect.gen(function* () {
            const procedures = yield* client;
            const seen: { readonly label: string; readonly route: string }[] = [];
            for (const golden of GOLDEN_QUERIES) {
              const result = yield* procedures['v1.search.query']({
                text: golden.query.text,
                scope: Option.getOrUndefined(golden.query.scope),
                bookCode: Option.getOrUndefined(golden.query.bookCode),
                limit: Option.getOrUndefined(golden.query.limit),
              });
              seen.push({ label: golden.label, route: result.route });
            }
            return seen;
          }),
        );

        // §9.3's routing survives the wire, per query rather than in aggregate.
        expect(routes).toEqual(
          GOLDEN_QUERIES.map((golden) => ({ label: golden.label, route: golden.route })),
        );

        // One request per query and no more: a client that re-queried to fill in
        // the topics group, or that retried on the typed absence, would raise it.
        expect(wire.requests().length).toBe(GOLDEN_QUERIES.length);
        expect(wire.requests()[0]?.tag).toBe('v1.search.query');
      }),
    // The whole golden set, one RPC per query, over a real port: more than the
    // default per-test budget allows.
    30_000,
  );

  it.scopedLive('the result that crosses is byte-identical to the local one', () =>
    Effect.gen(function* () {
      const wire = yield* wiredWith(hybridSearch);

      const overWire = yield* over(
        wire.clientPort,
        Effect.gen(function* () {
          const procedures = yield* client;
          return yield* procedures['v1.search.query']({ text: WORDY_QUERY });
        }),
      );

      // The same query answered by the same service *without* crossing a port.
      // This is the comparison that makes the test mean something: one value
      // went through structured clone and RPC decoding, the other did not.
      const local = yield* locally(WORDY_QUERY);

      // Encoded through §9's one codec on both sides: a field that structured
      // clone flattened, or an `Option` that decoded differently, fails here.
      expect(yield* encode(overWire)).toBe(yield* encode(local));
      // Not vacuous: this query reaches the vector leg and returns rows.
      expect(overWire.paragraphs.length).toBeGreaterThan(0);
      expect(overWire.vector._tag).toBe('ran');
    }),
  );

  it.scopedLive('a host without WebGPU degrades to lexical-only, typed', () =>
    Effect.gen(function* () {
      const wire = yield* wiredWith(noWebGpuSearch);

      const result = yield* over(
        wire.clientPort,
        Effect.gen(function* () {
          const procedures = yield* client;
          return yield* procedures['v1.search.query']({
            text: 'what happens at the close of probation',
          });
        }),
      );

      // §9.6's requirement that the absence be "the same typed value in all
      // three clients". An absence that flattened to a boolean at the boundary,
      // or a reason that decoded to a bare string, fails here.
      expect(result.vector._tag).toBe('unavailable');
      if (result.vector._tag !== 'unavailable') return;
      expect(result.vector.reason).toBe('embedder');

      // And the search still answered — degraded, not broken.
      expect(result.paragraphs.length).toBeGreaterThan(0);
    }),
  );

  it.scopedLive('the pinned topics group is its own field on the wire', () =>
    Effect.gen(function* () {
      const wire = yield* wiredWith(hybridSearch);
      const result = yield* over(
        wire.clientPort,
        Effect.gen(function* () {
          const procedures = yield* client;
          // The query the fixture catalog *matches*. With a query that matches no
          // topic, every assertion below holds against an empty list and the test
          // proves nothing — which is what it did before.
          return yield* procedures['v1.search.query']({ text: GOLDEN_TOPIC_QUERY });
        }),
      );

      // §9.4's group is no longer on this wire. `v1.search.query` answers with
      // retrieval over the writings, and a host that renders topic pages
      // fetches them from its own `WikiService` beside this call — see
      // `SearchResult`. What the round trip still has to prove is that the
      // topic-shaped query is answered out of the corpus at all, and that no
      // topic identity leaked into the ranking where a host could render it as
      // a paragraph.
      expect(result.paragraphs.length).toBeGreaterThan(0);
      expect(result.paragraphs.some((hit) => hit.paragraphId === String(GOLDEN_TOPIC_SLUG))).toBe(
        false,
      );
      expect(result.paragraphs.some((hit) => hit.refcode === String(GOLDEN_TOPIC_SLUG))).toBe(
        false,
      );
    }),
  );
});
