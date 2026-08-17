/** Milestone 5 adapter check in the web worker: **one** MessagePort crossing
 *  per verse.
 *
 *  The same claim `apps/desktop/tests/study-round-trip.test.ts` asserts for
 *  Electron main, on this host's own wire, over the same shared fixture
 *  (`@bible/core/study/testing`). §8.2 says the whole bundle comes back in one
 *  round trip because the pane always wants all of it; that is a property of
 *  the transport, so it is counted rather than assumed.
 *
 *  The instrumentation is a relay: the client's port and the server's port are
 *  two separate `MessageChannel`s bridged by a counter, so what is counted is
 *  the message that physically leaves the client and physically reaches the
 *  server — the real boundary the production worker crosses, with the
 *  production group, handlers and transport on the far side. A refactor that
 *  split the bundle into five per-resource procedures would raise the count.
 */

import { BibleProcedureGroup, BibleProcedureHandlers } from '@bible/core/procedure';
import { strongsNumber } from '@bible/core/study';
import {
  FIXTURE_BOOK,
  FIXTURE_CHAPTER,
  FIXTURE_CONCORDANCE_TOTAL,
  FIXTURE_LABEL,
  FIXTURE_VERSE,
  studyProcedureDependencies,
} from '@bible/core/study/testing';
import * as BrowserWorkerRunner from '@effect/platform-browser/BrowserWorkerRunner';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Fiber, Layer, Option } from 'effect';
import type { FromClientEncoded, RequestEncoded } from 'effect/unstable/rpc/RpcMessage';
import * as RpcClient from 'effect/unstable/rpc/RpcClient';
import * as RpcServer from 'effect/unstable/rpc/RpcServer';

import { layerWebProcedureTransport } from './procedure-client.js';

/** The worker-side server: the real production group, the real production
 *  handlers, and — the part this claim is about — the exact transport pair
 *  `layerProcedureServer` ends in, `RpcServer.layerProtocolWorkerRunner` over
 *  `BrowserWorkerRunner.layerMessagePort`.
 *
 *  `layerProcedureServer` itself is not called because its remaining
 *  dependencies want a wa-sqlite handle, an HTTP asset source and a user-state
 *  database, none of which this claim touches; what is reproduced is everything
 *  between the port and `StudyService`, which is what the count measures. */
const studyServer = (port: MessagePort) =>
  RpcServer.layer(BibleProcedureGroup).pipe(
    Layer.provide(BibleProcedureHandlers.pipe(Layer.provide(studyProcedureDependencies))),
    Layer.provide(RpcServer.layerProtocolWorkerRunner),
    Layer.provide(BrowserWorkerRunner.layerMessagePort(port)),
  );

/** What `@effect/platform-browser`'s worker protocol actually posts: a
 *  `[clientId, message]` tuple, not a bare RPC message. Declared as a type
 *  rather than probed at the call site — the relay's job is to count `Request`
 *  frames, and it can only do that if it knows the envelope they arrive in. */
type WorkerFrame = readonly [number, FromClientEncoded];

/** A type predicate rather than a `boolean`, so the narrowing survives into the
 *  collector: only a `RequestEncoded` carries `.tag`, the procedure name a test
 *  asserts on. */
const isRequestFrame = (frame: WorkerFrame): frame is readonly [number, RequestEncoded] =>
  frame[1]._tag === 'Request';

/** Two channels bridged by a counter: the client posts into one, the relay
 *  records each `Request` frame and forwards it into the other, where the real
 *  server runtime is listening. Both directions are genuine `MessagePort`
 *  traffic. */
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

const wired = Effect.gen(function* () {
  const wire = yield* Effect.acquireRelease(Effect.sync(bridged), (active) =>
    Effect.sync(() => active.close()),
  );
  const server = yield* Effect.forkScoped(Layer.launch(studyServer(wire.serverPort)));
  yield* Effect.addFinalizer(() => Fiber.interrupt(server));
  return wire;
});

describe('web worker study seam', () => {
  it.scopedLive('serves the whole verse bundle in one MessagePort round trip', () =>
    Effect.gen(function* () {
      const wire = yield* wired;

      const bundle = yield* Effect.gen(function* () {
        const procedures = yield* client;
        return yield* procedures['v1.study.verse.get']({
          book: FIXTURE_BOOK,
          chapter: FIXTURE_CHAPTER,
          verse: FIXTURE_VERSE,
        });
      }).pipe(Effect.provide(layerWebProcedureTransport(wire.clientPort)));

      // The claim: five sections, one crossing.
      expect(wire.requests().length).toBe(1);
      expect(wire.requests()[0]?.tag).toBe('v1.study.verse.get');

      // Not vacuous — a single crossing that delivered an empty shell would
      // satisfy the count and nothing else.
      expect(bundle.words.length).toBe(2);
      expect(bundle.crossRefs.length).toBe(1);
      expect(bundle.marginNotes.length).toBe(1);
      expect(bundle.commentary.map((entry) => entry.bookCode)).toEqual(['5BC']);
      expect(bundle.parallelWritings.map((entry) => entry.bookCode)).toEqual(['GC']);
      expect(bundle.label).toBe(FIXTURE_LABEL);
    }),
  );

  it.scopedLive("serves the Strong's word-tap payload in one MessagePort round trip", () =>
    Effect.gen(function* () {
      const wire = yield* wired;

      const result = yield* Effect.gen(function* () {
        const procedures = yield* client;
        return yield* procedures['v1.study.strongs.get']({
          number: strongsNumber('H8548'),
          limit: 4,
        });
      }).pipe(Effect.provide(layerWebProcedureTransport(wire.clientPort)));

      expect(wire.requests().length).toBe(1);
      expect(wire.requests()[0]?.tag).toBe('v1.study.strongs.get');
      // Lexicon entry and reverse concordance both arrived on that one crossing.
      expect(Option.isSome(result.entry)).toBe(true);
      expect(result.occurrences.length).toBe(4);
      expect(result.total).toBe(FIXTURE_CONCORDANCE_TOTAL);
    }),
  );
});
