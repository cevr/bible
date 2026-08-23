/** Milestone 7 adapter check on Electron main: the lookup crosses **this
 *  host's** port, and comes back as §7's five groups.
 *
 *  The same claim `apps/web/src/workers/lookup-round-trip.test.ts` asserts for
 *  the web worker, over the same shared fixture (`@bible/core/wiki/testing`).
 *  §10's adapter check and the map's compatibility contract ask for the web
 *  worker, the Electron main process and the Bun CLI; core's parity suite
 *  compares the handler's value with the CLI's, `packages/cli` runs the real
 *  command, and this file is the Electron protocol — a real
 *  `layerDesktopProcedureServer` over an instrumented `DesktopProcedureServerPort`,
 *  which is exactly the interface `MessageChannelMain` fills in production.
 *
 *  One crossing, for the reason the study bundle takes one: the panel always
 *  draws all five groups.
 */

import { BibleProcedureGroup } from '@bible/core/procedure';
import {
  LOOKUP_CONTEXT_REFERENCE,
  WIKI_PAGE_FIXTURE,
  wikiLookupProcedureDependencies,
} from '@bible/core/wiki/testing';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Fiber, Layer } from 'effect';
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

const serverDependencies = wikiLookupProcedureDependencies;

/** What crossed the Electron port, counted at the boundary itself.
 *
 *  `RequestEncoded` rather than the whole `FromClientEncoded` union: the
 *  collector below only stores `Request` frames, and keeping that narrowing in
 *  the type is what lets a test read `.tag` — the procedure name — which the
 *  union's other members do not carry. */
interface PortTraffic {
  readonly port: DesktopProcedureServerPort;
  readonly requests: () => readonly RequestEncoded[];
}

/** The Electron port pair, with the client→server direction instrumented.
 *
 *  `MessageChannel` carries both halves so the client transport under test is
 *  the production one; the server half is adapted to
 *  `DesktopProcedureServerPort`, which is precisely what `main.ts` builds from
 *  `MessageChannelMain`. Every `Request` that arrives is recorded before it
 *  reaches the server, so the count is of physical crossings. */
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

/** Run a client-side effect over a wired port. The transport layer is provided
 *  at this function's own boundary, so a test's generator stays a description of
 *  what it asks rather than a place where wiring happens. */
const over = <A, E>(
  port: MessagePort,
  ask: Effect.Effect<A, E, RpcClient.Protocol | Scope.Scope>,
): Effect.Effect<A, E, Scope.Scope> =>
  ask.pipe(Effect.provide(layerDesktopProcedureTransport(port)));

const wired = Effect.gen(function* () {
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
    Layer.launch(layerDesktopProcedureServer(traffic.port).pipe(Layer.provide(serverDependencies))),
  );
  yield* Effect.addFinalizer(() => Fiber.interrupt(server));
  return { traffic, clientPort: channel.port1 };
});

describe('desktop lookup seam', () => {
  it.scopedLive('serves §7’s five groups in one port round trip', () =>
    Effect.gen(function* () {
      const { traffic, clientPort } = yield* wired;

      const result = yield* over(
        clientPort,
        Effect.gen(function* () {
          const procedures = yield* client;
          return yield* procedures['v1.wiki.lookup.resolve']({ text: WIKI_PAGE_FIXTURE.phrase });
        }),
      );

      expect(traffic.requests().length).toBe(1);
      expect(traffic.requests()[0]?.tag).toBe('v1.wiki.lookup.resolve');

      // Not vacuous — four groups answered across this wire.
      expect(result.topics.map((match) => String(match.slug))).toEqual([WIKI_PAGE_FIXTURE.slug]);
      expect(result.verses.length).toBeGreaterThan(0);
      expect(result.writings.length).toBeGreaterThan(0);
      expect(result.catalog.length).toBeGreaterThan(0);
      expect(result.strongs).toEqual([]);
    }),
  );

  it.scopedLive('carries the optional verse context across the port', () =>
    Effect.gen(function* () {
      // The one payload field that can be dropped silently: it is optional, and
      // a lookup without it still answers with four full groups.
      const { clientPort } = yield* wired;

      const result = yield* over(
        clientPort,
        Effect.gen(function* () {
          const procedures = yield* client;
          return yield* procedures['v1.wiki.lookup.resolve']({
            text: WIKI_PAGE_FIXTURE.phrase,
            context: LOOKUP_CONTEXT_REFERENCE,
          });
        }),
      );

      expect(result.strongs.map((hit) => hit.word)).toEqual([WIKI_PAGE_FIXTURE.phrase]);
    }),
  );
});
