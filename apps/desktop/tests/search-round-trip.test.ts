/** §10 Milestone 8 on Electron main: **the golden query set crosses this host's
 *  real port and comes back as the same ordered result the other hosts get.**
 *
 *  `packages/core/src/search/host-parity.test.ts` proves the RPC handler and
 *  `SearchService` encode one value through one codec — over `RpcTest`, an
 *  in-memory client. What it cannot see is this boundary: a `Schema.Option` that
 *  survives `RpcTest` but not this transport, or a result whose ordering depends
 *  on something that does not serialize, would leave that suite green and this
 *  one red. So the same fixture and the same query set run here, over the port
 *  `layerDesktopProcedureServer` actually ends in.
 *
 *  Paired with `apps/web/src/workers/search-round-trip.test.ts`, which makes the
 *  identical claim on the worker's `MessagePort`. §9.7 asks that "ordered result
 *  identities and fallback behavior match" across web, desktop and CLI; those
 *  two files plus `packages/cli/test/commands/egw-search.test.ts` are the three
 *  hosts, compared against one fixture rather than three copies of it.
 */

import { BibleProcedureGroup } from '@bible/core/procedure';
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
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Fiber, Layer, Option, Schema } from 'effect';
import type { Scope } from 'effect';
import type {
  FromClientEncoded,
  FromServerEncoded,
  RequestEncoded,
} from 'effect/unstable/rpc/RpcMessage';
import * as RpcClient from 'effect/unstable/rpc/RpcClient';

import {
  layerDesktopProcedureServer,
  type DesktopProcedureServerPort,
} from '../electron/procedure-server.js';
import { layerDesktopProcedureTransport } from '../src/procedure-client-protocol.js';

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

/** Electron main with the native CPU adapter available and an index installed. */
const hybridSearch = goldenSearchLayer({
  index: Option.some(goldenVectorIndexBytes()),
  embedder,
});

/** The same host with no vector index — the ordinary desktop install, before
 *  the optional artifact has been built or downloaded. */
const lexicalOnlySearch = goldenSearchLayer();

interface PortTraffic {
  readonly port: DesktopProcedureServerPort;
  readonly requests: () => readonly RequestEncoded[];
}

const instrumentedPort = (channel: MessageChannel): PortTraffic => {
  const requests: RequestEncoded[] = [];
  return {
    requests: () => requests,
    port: {
      subscribe: (listener) => {
        const onMessage = (event: MessageEvent<FromClientEncoded>) => {
          if (event.data._tag === 'Request') requests.push(event.data);
          listener(event.data);
        };
        channel.port2.addEventListener('message', onMessage);
        return () => channel.port2.removeEventListener('message', onMessage);
      },
      onClose: () => () => {},
      send: (message: FromServerEncoded) => channel.port2.postMessage(message),
      start: () => channel.port2.start(),
    },
  };
};

const client = RpcClient.make(BibleProcedureGroup);

const wiredWith = (search: Layer.Layer<SearchService>) =>
  Effect.gen(function* () {
    const channel = yield* Effect.acquireRelease(
      Effect.sync(() => new MessageChannel()),
      (active) =>
        Effect.sync(() => {
          active.port1.close();
          active.port2.close();
        }),
    );
    const traffic = instrumentedPort(channel);
    const server = yield* Effect.forkScoped(
      Layer.launch(
        layerDesktopProcedureServer(traffic.port).pipe(
          Layer.provide(procedureDependencies({ search })),
        ),
      ),
    );
    yield* Effect.addFinalizer(() => Fiber.interrupt(server));
    return { traffic, clientPort: channel.port1 };
  });

/** Run a client-side effect over a wired port. The transport layer is provided
 *  at this function's own boundary, so a test's generator stays a description of
 *  what it asks rather than a place where wiring happens. */
const over = <A, E>(
  port: MessagePort,
  ask: Effect.Effect<A, E, RpcClient.Protocol | Scope.Scope>,
): Effect.Effect<A, E, Scope.Scope> =>
  ask.pipe(Effect.provide(layerDesktopProcedureTransport(port)));

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

describe('desktop hybrid search', () => {
  it.scopedLive(
    'carries the whole golden query set across the port',
    () =>
      Effect.gen(function* () {
        const { traffic, clientPort } = yield* wiredWith(hybridSearch);

        // One client for the whole set, built once. Building it per query would
        // negotiate a fresh connection over a port that already has one, which is
        // not what a host does and not what this file is measuring.
        const routes = yield* over(
          clientPort,
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
        expect(traffic.requests().length).toBe(GOLDEN_QUERIES.length);
        expect(traffic.requests()[0]?.tag).toBe('v1.search.query');
      }),
    // The whole golden set, one RPC per query, over a real port: more than the
    // default per-test budget allows.
    30_000,
  );

  it.scopedLive('the result that crosses is byte-identical to the local one', () =>
    Effect.gen(function* () {
      const { clientPort } = yield* wiredWith(hybridSearch);

      const overWire = yield* over(
        clientPort,
        Effect.gen(function* () {
          const procedures = yield* client;
          return yield* procedures['v1.search.query']({ text: WORDY_QUERY });
        }),
      );

      // The same query answered by the same service *without* crossing the
      // port. That contrast is what makes the comparison mean something.
      const local = yield* locally(WORDY_QUERY);

      expect(yield* encode(overWire)).toBe(yield* encode(local));
      // Not vacuous: this query reaches the vector leg and returns rows.
      expect(overWire.paragraphs.length).toBeGreaterThan(0);
      expect(overWire.vector._tag).toBe('ran');
    }),
  );

  it.scopedLive('an install without the index degrades to lexical-only, typed', () =>
    Effect.gen(function* () {
      const { clientPort } = yield* wiredWith(lexicalOnlySearch);

      const result = yield* over(
        clientPort,
        Effect.gen(function* () {
          const procedures = yield* client;
          return yield* procedures['v1.search.query']({ text: WORDY_QUERY });
        }),
      );

      // §9.6's requirement that the absence be "the same typed value in all
      // three clients" — the identical assertion the web round trip makes, on
      // the other transport.
      expect(result.vector._tag).toBe('unavailable');
      if (result.vector._tag !== 'unavailable') return;
      expect(result.vector.reason).toBe('absent');

      // And the search still answered — degraded, not broken.
      expect(result.paragraphs.length).toBeGreaterThan(0);
    }),
  );

  it.scopedLive('the pinned topics group never merges into the paragraph ranking', () =>
    Effect.gen(function* () {
      const { clientPort } = yield* wiredWith(hybridSearch);
      // The query the fixture catalog *matches*. Asked with a query that
      // matches no topic, every assertion below holds against an empty list and
      // the test proves nothing — which is what it did before.
      const result = yield* over(
        clientPort,
        Effect.gen(function* () {
          const procedures = yield* client;
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
