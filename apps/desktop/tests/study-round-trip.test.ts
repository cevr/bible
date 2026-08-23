/** Milestone 5 adapter check on Electron main: **one** port crossing per verse.
 *
 *  §8.2 says the whole study bundle comes back in one round trip because the
 *  pane always wants all of it. That is a claim about this host's wire, so it is
 *  asserted here rather than assumed: a real `layerDesktopProcedureServer` runs
 *  over an instrumented `DesktopProcedureServerPort`, a real client calls
 *  `v1.study.verse.get` once, and the requests that crossed the boundary are
 *  counted.
 *
 *  The counter is on the port itself — the exact interface Electron's
 *  `MessageChannelMain` fills in production — so what it counts is the physical
 *  boundary, not a stand-in for it. A refactor that split the bundle into five
 *  per-resource procedures would raise the count and fail here, which is the
 *  whole point of asserting it.
 *
 *  The fixture is `@bible/core/study/testing`, the same one the web worker's
 *  round-trip test and core's own parity test read — so the two hosts are
 *  compared against one input rather than against two hand-copied ones.
 */

import { BibleProcedureGroup } from '@bible/core/procedure';
import { strongsNumber } from '@bible/core/study';
import {
  FIXTURE_BOOK,
  FIXTURE_CHAPTER,
  FIXTURE_CONCORDANCE_TOTAL,
  FIXTURE_LABEL,
  FIXTURE_VERSE,
  studyProcedureDependencies,
} from '@bible/core/study/testing';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Fiber, Layer, Option } from 'effect';
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

const serverDependencies = studyProcedureDependencies;

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

describe('desktop study seam', () => {
  it.scopedLive('serves the whole verse bundle in one port round trip', () =>
    Effect.gen(function* () {
      const { traffic, clientPort } = yield* wired;

      const bundle = yield* over(
        clientPort,
        Effect.gen(function* () {
          const procedures = yield* client;
          return yield* procedures['v1.study.verse.get']({
            book: FIXTURE_BOOK,
            chapter: FIXTURE_CHAPTER,
            verse: FIXTURE_VERSE,
          });
        }),
      );

      // The claim: five sections, one crossing.
      expect(traffic.requests().length).toBe(1);
      expect(traffic.requests()[0]?.tag).toBe('v1.study.verse.get');

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

  it.scopedLive("serves the Strong's word-tap payload in one port round trip", () =>
    Effect.gen(function* () {
      const { traffic, clientPort } = yield* wired;

      const result = yield* over(
        clientPort,
        Effect.gen(function* () {
          const procedures = yield* client;
          return yield* procedures['v1.study.strongs.get']({
            number: strongsNumber('H8548'),
            limit: 4,
          });
        }),
      );

      expect(traffic.requests().length).toBe(1);
      expect(traffic.requests()[0]?.tag).toBe('v1.study.strongs.get');
      // Lexicon entry and reverse concordance both arrived on that one crossing.
      expect(Option.isSome(result.entry)).toBe(true);
      expect(result.occurrences.length).toBe(4);
      expect(result.total).toBe(FIXTURE_CONCORDANCE_TOTAL);
    }),
  );
});
