/** Milestone 7 adapter check in the web worker: the lookup crosses **this
 *  host's** protocol, and comes back as §7's five groups.
 *
 *  The same claim `apps/desktop/tests/lookup-round-trip.test.ts` asserts for
 *  Electron main, over the same shared fixture (`@bible/core/wiki/testing`).
 *  §10's Milestone 7 adapter check and the map's compatibility contract both ask
 *  for the web worker, the Electron main process and the Bun CLI to be exercised
 *  — `packages/core/src/wiki/lookup-parity.test.ts` compares the handler and the
 *  CLI's value, and `packages/cli/test/commands/wiki.test.ts` runs the real
 *  command, so what was missing was the two host protocols. A payload field that
 *  did not survive *this* transport would be invisible to all three.
 *
 *  One crossing, for the reason `study-round-trip.test.ts` counts one: the panel
 *  always draws all five groups, so five per-group procedures would be four
 *  extra round trips on the two hosts that reach core over a MessagePort.
 */

import { BibleProcedureGroup, BibleProcedureHandlers } from '@bible/core/procedure';
import {
  LOOKUP_CONTEXT_REFERENCE,
  WIKI_PAGE_FIXTURE,
  wikiLookupProcedureDependencies,
} from '@bible/core/wiki/testing';
import * as BrowserWorkerRunner from '@effect/platform-browser/BrowserWorkerRunner';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Fiber, Layer } from 'effect';
import type { Scope } from 'effect';
import type { FromClientEncoded, RequestEncoded } from 'effect/unstable/rpc/RpcMessage';
import * as RpcClient from 'effect/unstable/rpc/RpcClient';
import * as RpcServer from 'effect/unstable/rpc/RpcServer';

import { layerWebProcedureTransport } from './procedure-client.js';

const lookupServer = (port: MessagePort) =>
  RpcServer.layer(BibleProcedureGroup).pipe(
    Layer.provide(BibleProcedureHandlers.pipe(Layer.provide(wikiLookupProcedureDependencies))),
    Layer.provide(RpcServer.layerProtocolWorkerRunner),
    Layer.provide(BrowserWorkerRunner.layerMessagePort(port)),
  );

/** What `@effect/platform-browser`'s worker protocol posts: a `[clientId,
 *  message]` tuple rather than a bare RPC message. */
type WorkerFrame = readonly [number, FromClientEncoded];

const isRequestFrame = (frame: WorkerFrame): frame is readonly [number, RequestEncoded] =>
  frame[1]._tag === 'Request';

interface Wire {
  readonly clientPort: MessagePort;
  readonly serverPort: MessagePort;
  readonly requests: () => readonly RequestEncoded[];
  readonly close: () => void;
}

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
  const server = yield* Effect.forkScoped(Layer.launch(lookupServer(wire.serverPort)));
  yield* Effect.addFinalizer(() => Fiber.interrupt(server));
  return wire;
});

describe('web worker lookup seam', () => {
  it.scopedLive('serves §7’s five groups in one MessagePort round trip', () =>
    Effect.gen(function* () {
      const wire = yield* wired;

      const result = yield* over(
        wire.clientPort,
        Effect.gen(function* () {
          const procedures = yield* client;
          return yield* procedures['v1.wiki.lookup.resolve']({ text: WIKI_PAGE_FIXTURE.phrase });
        }),
      );

      expect(wire.requests().length).toBe(1);
      expect(wire.requests()[0]?.tag).toBe('v1.wiki.lookup.resolve');

      // Not vacuous — four groups answered across this wire.
      expect(result.topics.map((match) => String(match.slug))).toEqual([WIKI_PAGE_FIXTURE.slug]);
      expect(result.verses.length).toBeGreaterThan(0);
      expect(result.writings.length).toBeGreaterThan(0);
      expect(result.catalog.length).toBeGreaterThan(0);
      expect(result.strongs).toEqual([]);
    }),
  );

  it.scopedLive('carries the optional verse context across the protocol', () =>
    Effect.gen(function* () {
      // The one payload field that can be dropped silently: it is optional, and
      // a lookup without it still answers with four full groups. Asserted on
      // the group only a context can fill.
      const wire = yield* wired;

      const result = yield* over(
        wire.clientPort,
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
