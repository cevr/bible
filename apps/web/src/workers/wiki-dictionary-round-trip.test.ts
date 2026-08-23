/** Milestone 6 adapter check in the web worker: **the dictionary crosses the
 *  MessagePort once, and the automaton is built on the client side of it.**
 *
 *  The same claim `apps/desktop/tests/wiki-dictionary-round-trip.test.ts`
 *  asserts for Electron main, on this host's own wire, over the same shared
 *  fixture (`@bible/core/wiki/testing`). §10's Milestone 6 asks that the
 *  dictionary load and the automaton build in the worker, in Electron main and
 *  in the CLI **without host imports crossing the boundary** — three hosts, one
 *  fixture, and here the third of them.
 *
 *  Two halves, each needing its own kind of evidence:
 *
 *  - *Loads.* `v1.wiki.dictionary.get` crosses a real `MessagePort` pair and
 *    decodes into `PhraseDictionary`, counted by the same relay the study round
 *    trip uses so what is measured is the physical worker boundary.
 *  - *Builds, client-side.* §4.1's argument is that matching is **not** an RPC:
 *    the automaton is built from the dictionary the client already holds and run
 *    against the text it is about to draw, because a round trip per screenful
 *    would cost more than the work it delegates. So the match happens *after*
 *    the crossing and the traffic count is asserted again afterwards. A design
 *    that quietly added a `v1.wiki.matches` procedure would raise it.
 *
 *  "Without host imports crossing the boundary" is structural, and the file's
 *  own imports are the evidence: everything the match is performed with comes
 *  from `@bible/core/wiki` and `@bible/core/wiki/testing`, and no worker module
 *  reaches the matcher. `PhraseAutomaton.make` runs here with no wa-sqlite
 *  handle, no `WikiService` and no worker host in scope — the client half needs
 *  the dictionary and nothing else, which is the claim.
 */

import { BibleProcedureGroup, BibleProcedureHandlers } from '@bible/core/procedure';
import { procedureDependencies } from '@bible/core/procedure/testing';
import { matchRun, PhraseAutomaton, PhraseSpansJson, WikiService } from '@bible/core/wiki';
import { DANIEL_8_9, PHRASE_FIXTURE_DICTIONARY } from '@bible/core/wiki/testing';
import * as BrowserWorkerRunner from '@effect/platform-browser/BrowserWorkerRunner';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Fiber, Layer, Schema } from 'effect';
import type { Scope } from 'effect';
import type { FromClientEncoded, RequestEncoded } from 'effect/unstable/rpc/RpcMessage';
import * as RpcClient from 'effect/unstable/rpc/RpcClient';
import * as RpcServer from 'effect/unstable/rpc/RpcServer';

import { layerWebProcedureTransport } from './procedure-client.js';

/** A `WikiService` holding the shared fixture dictionary.
 *
 *  Served in memory rather than out of a real artifact, because what this file
 *  is about is the **transport**. The worker's artifact path — `WikiService.Live`
 *  over `layerWorkerSqlClient`, with `WikiService.Absent` as the `onNone` branch
 *  — is wired in `procedure-server.ts` and exercised by the artifact suites;
 *  composing the two here would test the driver twice and the port once. */
const fixtureWiki: Layer.Layer<WikiService> = Layer.succeed(
  WikiService,
  WikiService.of({
    list: () => Effect.succeed([]),
    topic: () => Effect.die('not under test'),
    dictionary: Effect.succeed(PHRASE_FIXTURE_DICTIONARY),
    availability: Effect.succeedNone,
  }),
);

/** The worker-side server: the real production group, the real production
 *  handlers, and the exact transport pair `layerProcedureServer` ends in. Same
 *  construction as the study round trip beside it, for the same reason — what is
 *  reproduced is everything between the port and the service. */
const wikiServer = (port: MessagePort) =>
  RpcServer.layer(BibleProcedureGroup).pipe(
    Layer.provide(
      BibleProcedureHandlers.pipe(
        Layer.provide(procedureDependencies({ generation: 'wiki-dictionary', wiki: fixtureWiki })),
      ),
    ),
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
 *  crosses. */
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
  const server = yield* Effect.forkScoped(Layer.launch(wikiServer(wire.serverPort)));
  yield* Effect.addFinalizer(() => Fiber.interrupt(server));
  return wire;
});

describe('web worker wiki dictionary', () => {
  it.scopedLive('crosses the port once, and the automaton builds on this side of it', () =>
    Effect.gen(function* () {
      const wire = yield* wired;

      const dictionary = yield* over(
        wire.clientPort,
        Effect.gen(function* () {
          const procedures = yield* client;
          return yield* procedures['v1.wiki.dictionary.get']({});
        }),
      );

      expect(wire.requests().length).toBe(1);
      expect(wire.requests()[0]?.tag).toBe('v1.wiki.dictionary.get');
      expect(dictionary.entries.length).toBe(PHRASE_FIXTURE_DICTIONARY.entries.length);

      // The automaton, built here — on the client side, from the value that
      // crossed — and matched with no further traffic. That second count is the
      // §4.1 claim: matching is render-time and local, not an RPC.
      const spans = matchRun(PhraseAutomaton.make(dictionary), DANIEL_8_9);
      expect(wire.requests().length).toBe(1);

      // Byte-identical to the offsets the other hosts pin for this verse.
      expect(
        spans.map((span) => ({
          start: span.start,
          end: span.end,
          slug: String(span.slug),
          alias: span.alias,
        })),
      ).toEqual([{ start: 36, end: 47, slug: 'little-horn', alias: 'little horn' }]);

      // And identical on the wire, not only in memory.
      const encode = Schema.encodeEffect(Schema.fromJsonString(PhraseSpansJson));
      expect(yield* encode(spans)).toBe(
        yield* encode(matchRun(PhraseAutomaton.make(PHRASE_FIXTURE_DICTIONARY), DANIEL_8_9)),
      );
    }),
  );
});
