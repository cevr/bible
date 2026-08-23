/** §10 Milestone 9 in the web worker: **the update decision crosses this host's
 *  real `MessagePort` unchanged, and this host's adapter answers the same table
 *  the other two do.**
 *
 *  The same claim `apps/desktop/tests/content-round-trip.test.ts` asserts for
 *  Electron main, on this host's own wire, over the same shared fixture
 *  (`@bible/core/content-update/testing`). §3.6's status is the most
 *  `Option`-dense value the group carries — `installed` is an `Option`,
 *  `floor.pinned` is an `Option` inside a nested class, and `refused` carries a
 *  whole manifest entry — so it is crossed rather than assumed to cross.
 *
 *  The browser's own difference from the other two hosts is the *address*: it
 *  reads `/api/content/manifest` because it cannot reach the release host
 *  directly (no CORS), exactly as `/api/assets/topics` already works. That
 *  route's shape is asserted here too, so a server that renamed it fails on
 *  this side rather than silently leaving every browser offline.
 */

import {
  ADAPTER_EXPECTATIONS,
  ADAPTER_ROUTES,
  liveAdapterConformance,
  OVERRUN_REVISION,
  refusingContentUpdate,
} from '@bible/core/content-update/testing';
import {
  CONTENT_MANIFEST_MAX_BYTES,
  CONTENT_MANIFEST_PROXY_PATH,
} from '@bible/core/content-update';
import { FetchHttpClient, HttpServerResponse } from 'effect/unstable/http';

import { contentManifestResponse } from '../../server/content-manifest-proxy.js';
import { BibleProcedureGroup, BibleProcedureHandlers } from '@bible/core/procedure';
import { procedureDependencies } from '@bible/core/procedure/testing';
import * as BrowserWorkerRunner from '@effect/platform-browser/BrowserWorkerRunner';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Fiber, Layer, Option } from 'effect';
import type { Scope } from 'effect';
import type { FromClientEncoded, RequestEncoded } from 'effect/unstable/rpc/RpcMessage';
import * as RpcClient from 'effect/unstable/rpc/RpcClient';
import * as RpcServer from 'effect/unstable/rpc/RpcServer';

import { layerWebProcedureTransport } from './procedure-client.js';

/** The worker-side server: the real production group, the real production
 *  handlers, and the exact transport pair `layerProcedureServer` ends in.
 *
 *  `layerProcedureServer` itself is not called because its other dependencies
 *  want a wa-sqlite handle and a user-state database, none of which this claim
 *  touches; what is reproduced is everything between the port and
 *  `ContentUpdate`. */
const contentServer = (port: MessagePort) =>
  RpcServer.layer(BibleProcedureGroup).pipe(
    Layer.provide(
      BibleProcedureHandlers.pipe(
        Layer.provide(procedureDependencies({ content: refusingContentUpdate })),
      ),
    ),
    Layer.provide(RpcServer.layerProtocolWorkerRunner),
    Layer.provide(BrowserWorkerRunner.layerMessagePort(port)),
  );

/** What `@effect/platform-browser`'s worker protocol actually posts: a
 *  `[clientId, message]` tuple, not a bare RPC message. */
type WorkerFrame = readonly [number, FromClientEncoded];

const isRequestFrame = (frame: WorkerFrame): frame is readonly [number, RequestEncoded] =>
  frame[1]._tag === 'Request';

interface Wire {
  readonly clientPort: MessagePort;
  readonly serverPort: MessagePort;
  readonly requests: () => readonly RequestEncoded[];
  readonly close: () => void;
}

/** Two channels bridged by a counter, so what is counted is the message that
 *  physically leaves the client and physically reaches the server. */
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

/** Run a client-side effect over a wired port. The transport layer is provided
 *  at this function's own boundary, so a test's generator stays a description of
 *  what it asks rather than a place where wiring happens. */
const over = <A, E>(
  port: MessagePort,
  ask: Effect.Effect<A, E, RpcClient.Protocol | Scope.Scope>,
) => ask.pipe(Effect.provide(layerWebProcedureTransport(port)));

const wired = Effect.gen(function* () {
  const wire = yield* Effect.acquireRelease(Effect.sync(bridged), (active) =>
    Effect.sync(() => active.close()),
  );
  const server = yield* Effect.forkScoped(Layer.launch(contentServer(wire.serverPort)));
  yield* Effect.addFinalizer(() => Fiber.interrupt(server));
  return wire;
});

/** A server that answers each fixture case **through the production proxy
 *  handler**.
 *
 *  Two servers in one: an `upstream` half standing in for the release host, and
 *  the proxy half calling `contentManifestResponse` with that upstream's
 *  address. The proxy's own `fetch` is injected so it reaches the upstream half
 *  rather than the network; everything else — the origin gate, the redirect
 *  refusal, the size cap, the timeout — is the shipped code path.
 *
 *  Loopback is what makes the fixture addresses pass the origin gate, so the
 *  cases fail for their own reasons rather than all reading `offline`. */
const serveThroughProxy = Effect.acquireRelease(
  Effect.sync(() => {
    const routes = new Map(ADAPTER_ROUTES);
    /** The address the upstream half answers at, once the port is known.
     *  Captured on the first request rather than guessed, because an ephemeral
     *  port is not knowable until the server binds. */
    const upstreamAt = (host: string, path: string) => `http://${host}/upstream${path}`;
    // oxlint-disable-next-line effect/noGlobals -- the point of this suite is a real socket, not a platform service over one
    return Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: (request) => {
        const url = new URL(request.url);
        const path = url.pathname;
        // The upstream half, addressed only by the proxy below.
        if (path.startsWith('/upstream')) {
          const route = Option.fromUndefinedOr(routes.get(path.replace('/upstream', '')));
          return Option.match(route, {
            onNone: () => new Response('no such fixture', { status: 404 }),
            onSome: (found) => new Response(found.body, { status: found.status }),
          });
        }
        // Two redirect fixtures the trust cases below reach for. One hop onto
        // the upstream half, which the proxy must follow; one hop to a foreign
        // origin, which it must refuse.
        if (path === '/redirect-once.json') {
          return new Response('', {
            status: 302,
            headers: { location: upstreamAt(url.host, '/offered.json') },
          });
        }
        if (path === '/redirect-away.json') {
          return new Response('', {
            status: 302,
            headers: { location: 'https://manifest.attacker.test/manifest.json' },
          });
        }
        // A body larger than the cap that states no length — the case the
        // declared-length check cannot see (round-4 F4).
        if (path === '/chunked.json') {
          return new Response(chunkedBody(CONTENT_MANIFEST_MAX_BYTES * 2), { status: 200 });
        }
        // The proxy half: the real handler, pointed at the upstream half.
        return Effect.runPromise(
          contentManifestResponse({
            url: upstreamAt(url.host, path),
            headers: {},
            // The origins this suite bound. Production's list is the release
            // host alone (round-4 F4); a fixture states its own rather than
            // widening what every install trusts.
            origins: [url.origin],
            // The proxy's own upstream call. Injected so it reaches the
            // fixture half above rather than the network — and left as the
            // platform `fetch` because that is exactly what `main.ts` hands it.
            // oxlint-disable-next-line effect/noGlobals -- the injected upstream this route takes in production
            fetch: (address, init) => fetch(address, init),
          }).pipe(Effect.map((response) => HttpServerResponse.toWeb(response))),
        );
      },
    });
  }),
  (server) => Effect.promise(() => server.stop(true)),
);

/** A body with no `Content-Length`, larger than the cap. A `ReadableStream`
 *  rather than a string, because a `Response` built from a string states its
 *  own length and the claim is about the case where nothing is stated. */
const chunkedBody = (bytes: number): ReadableStream<Uint8Array> => {
  const chunk = new Uint8Array(16_384).fill(120);
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull: (controller) => {
      if (sent >= bytes) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
      sent += chunk.byteLength;
    },
  });
};

/** One direct call into the shipped proxy handler, against a fixture server.
 *
 *  The trust cases below are about what the *proxy* does with an upstream —
 *  follow one hop, refuse a foreign hop, refuse an unbounded body — so they
 *  call the handler rather than going through a client that would report every
 *  refusal as the same `offline`. */
const throughProxy = (input: { readonly url: string; readonly origins: readonly string[] }) =>
  contentManifestResponse({
    url: input.url,
    headers: {},
    origins: input.origins,
    // oxlint-disable-next-line effect/noGlobals -- the injected upstream this route takes in production
    fetch: (address, init) => fetch(address, init),
  });

describe('web worker runtime content updates', () => {
  it.scopedLive('carries the schema-major refusal across the port whole', () =>
    Effect.gen(function* () {
      const wire = yield* wired;

      const status = yield* over(
        wire.clientPort,
        Effect.gen(function* () {
          const procedures = yield* client;
          return yield* procedures['v1.content.status']({ corpus: 'topics' });
        }),
      );

      expect(status.decision._tag).toBe(ADAPTER_EXPECTATIONS.overrun);
      if (status.decision._tag !== 'refused') return;
      expect(status.decision.reason).toBe('schema-major');
      // The nested entry survived the encoder, not just the tag.
      expect(String(status.decision.available.revision)).toBe(String(OVERRUN_REVISION));
      // And the two `Option` fields arrived as `Option`s.
      expect(Option.isNone(status.installed)).toBe(true);
      expect(Option.isNone(status.floor.pinned)).toBe(true);

      // One crossing for the whole status.
      expect(wire.requests().length).toBe(1);
      expect(wire.requests()[0]?.tag).toBe('v1.content.status');
    }),
  );

  it.scopedLive('a refused update installs nothing and says so', () =>
    Effect.gen(function* () {
      const wire = yield* wired;

      const outcome = yield* over(
        wire.clientPort,
        Effect.gen(function* () {
          const procedures = yield* client;
          return yield* procedures['v1.content.update']({ corpus: 'topics' });
        }),
      );

      expect(Option.isNone(outcome.activated)).toBe(true);
      expect(outcome.status.decision._tag).toBe('refused');
      expect(wire.requests().length).toBe(1);
    }),
  );

  /** The browser's leg of §10 M9's cross-host table, over **both** real pieces
   *  (round-3 F5).
   *
   *  The worker's own `FetchHttpClient` is the client, and the answer comes
   *  from `contentManifestResponse` — the *same handler* `server/main.ts`
   *  mounts, not a re-implementation of it. That pairing is the browser's whole
   *  difference from the other two hosts: two components in the path instead of
   *  one, so a proxy that turned a 404 into a 200, or dropped the body, or
   *  refused the fixture, breaks a case here that Bun and Node both pass.
   *
   *  It ran against stub clients before, which meant neither the worker's
   *  client nor the proxy was ever exercised and the "all three hosts" claim
   *  rested on one transport. */
  it.scopedLive("this host's real client answers the cross-host table through the real proxy", () =>
    Effect.gen(function* () {
      const server = yield* serveThroughProxy;
      const table = yield* liveAdapterConformance({
        client: FetchHttpClient.layer,
        baseUrl: `http://127.0.0.1:${String(server.port)}`,
        // Loopback with nothing bound, reached through the proxy like every
        // other case — so what answers `offline` is the proxy failing to reach
        // an upstream, which is the state a browser sees before any release is
        // published.
        closedUrl: `http://127.0.0.1:${String(server.port)}/unreachable.json`,
      });
      expect(table).toEqual(ADAPTER_EXPECTATIONS);
    }),
  );

  it.effect('reads the manifest from a same-origin route', () =>
    Effect.sync(() => {
      // The browser's whole difference from the other two hosts. A relative
      // path is what makes it same-origin — an absolute URL here would mean the
      // worker was pointed back at a host it cannot reach, and every browser
      // would report `offline` forever with nothing failing.
      expect(CONTENT_MANIFEST_PROXY_PATH.startsWith('/api/')).toBe(true);
    }),
  );
  /** **The proxy's redirect policy** (round-4 F4).
   *
   *  The production GitHub URL answers with one hop to the asset host, so a
   *  proxy that refused every redirect could never serve the shipped manifest —
   *  which is what it did, with the redirect-limit constant this build declares
   *  going unused. Following blindly is the other failure: a chain would walk
   *  this *server-side* fetch off the origin the gate just checked, which is
   *  the request-forgery shape the gate exists to stop.
   *
   *  Asserted at the handler, so the answer distinguishes "served the manifest"
   *  from "refused" rather than collapsing both into `offline`. */
  it.scopedLive('follows one redirect onto the allowlist and serves the manifest', () =>
    Effect.gen(function* () {
      const server = yield* serveThroughProxy;
      const origin = `http://127.0.0.1:${String(server.port)}`;

      const response = yield* throughProxy({
        url: `${origin}/redirect-once.json`,
        origins: [origin],
      });

      expect(response.status).toBe(200);
    }),
  );

  it.scopedLive('refuses a redirect that leaves the allowed origins', () =>
    Effect.gen(function* () {
      const server = yield* serveThroughProxy;
      const origin = `http://127.0.0.1:${String(server.port)}`;

      const response = yield* throughProxy({
        url: `${origin}/redirect-away.json`,
        origins: [origin],
      });

      expect(response.status).toBe(502);
    }),
  );

  /** **The counted cap** (round-4 F4). An upstream that declares no length —
   *  every chunked response — could stream an unbounded body through this
   *  server and into a browser while the declared-length check passed
   *  vacuously. */
  it.scopedLive('refuses an oversized body that declares no content length', () =>
    Effect.gen(function* () {
      const server = yield* serveThroughProxy;
      const origin = `http://127.0.0.1:${String(server.port)}`;

      const response = yield* throughProxy({
        url: `${origin}/chunked.json`,
        origins: [origin],
      });

      expect(response.status).toBe(502);
    }),
  );
});
