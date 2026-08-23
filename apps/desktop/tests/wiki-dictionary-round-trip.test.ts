/** Milestone 6 adapter check on Electron main: **the dictionary crosses the
 *  port once, and the automaton is built on the client side of it.**
 *
 *  §10's Milestone 6 asks that "the dictionary loads and the automaton builds in
 *  the worker, in Electron main, and in the CLI **without host imports crossing
 *  the boundary**". Two halves, and each needs a different kind of evidence:
 *
 *  - *Loads.* `v1.wiki.dictionary.get` crosses this host's real port and decodes
 *    into `PhraseDictionary`. Asserted over the same instrumented
 *    `DesktopProcedureServerPort` the study round trip uses, so what is counted
 *    is the physical Electron boundary rather than a stand-in for it.
 *  - *Builds, client-side.* §4.1's whole argument is that matching is **not** an
 *    RPC: the automaton is built from the dictionary the client already holds
 *    and matched against the text the client is about to draw, because a round
 *    trip per screenful would cost more than the work it delegates. So the test
 *    matches a fixture verse **after** the crossing is complete and asserts that
 *    no further traffic occurred. A design that quietly added a `v1.wiki.matches`
 *    round trip would raise the count here.
 *
 *  "Without host imports crossing the boundary" is a *structural* property and
 *  is where the file's own imports do the work: everything matched with comes
 *  from `@bible/core/wiki` and `@bible/core/wiki/testing`, and nothing from
 *  `electron/` reaches the matcher. `PhraseAutomaton.make` runs in this process
 *  with no Electron module in scope, which is the claim.
 *
 *  The fixture is the shared Daniel 8 one, so this host, the web worker, the CLI
 *  and core's own parity suite are all compared against a single input — §4.2's
 *  "byte-identical offsets across hosts" is a claim about one verse, not four
 *  copies of it that have not diverged yet.
 */

import { BibleProcedureGroup } from '@bible/core/procedure';
import { procedureDependencies } from '@bible/core/procedure/testing';
import { matchRun, PhraseAutomaton, PhraseSpansJson, WikiService } from '@bible/core/wiki';
import { DANIEL_8_9, PHRASE_FIXTURE_DICTIONARY } from '@bible/core/wiki/testing';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Fiber, Layer, Schema } from 'effect';
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

/** A `WikiService` holding the shared fixture dictionary.
 *
 *  Served in memory rather than out of a real `topics.db`, because what this
 *  file is about is the **transport**, and `apps/desktop/tests/wiki-artifact.test.ts`
 *  beside it already covers this host reading a real artifact off the Node
 *  SQLite driver. Composing the two would test the driver twice and the port
 *  once. */
const fixtureWiki: Layer.Layer<WikiService> = Layer.succeed(
  WikiService,
  WikiService.of({
    list: () => Effect.succeed([]),
    topic: () => Effect.die('not under test'),
    dictionary: Effect.succeed(PHRASE_FIXTURE_DICTIONARY),
    availability: Effect.succeedNone,
  }),
);

const serverDependencies = procedureDependencies({
  generation: 'wiki-dictionary',
  wiki: fixtureWiki,
});

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

describe('desktop wiki dictionary', () => {
  it.scopedLive('crosses the port once, and the automaton builds on this side of it', () =>
    Effect.gen(function* () {
      const { traffic, clientPort } = yield* wired;

      const dictionary = yield* over(
        clientPort,
        Effect.gen(function* () {
          const procedures = yield* client;
          return yield* procedures['v1.wiki.dictionary.get']({});
        }),
      );

      expect(traffic.requests().length).toBe(1);
      expect(traffic.requests()[0]?.tag).toBe('v1.wiki.dictionary.get');
      expect(dictionary.entries.length).toBe(PHRASE_FIXTURE_DICTIONARY.entries.length);

      // The automaton, built here — in the renderer's process, from the value
      // that crossed — and matched with no further traffic. That last assertion
      // is the §4.1 claim: matching is render-time and local, not an RPC.
      const spans = matchRun(PhraseAutomaton.make(dictionary), DANIEL_8_9);
      expect(traffic.requests().length).toBe(1);

      // Byte-identical to the offsets every other host pins for this verse.
      expect(
        spans.map((span) => ({
          start: span.start,
          end: span.end,
          slug: String(span.slug),
          alias: span.alias,
        })),
      ).toEqual([{ start: 36, end: 47, slug: 'little-horn', alias: 'little horn' }]);

      // And identical on the wire, not only in memory — through the same codec
      // a renderer and `bible wiki matches --json` both run.
      const encode = Schema.encodeEffect(Schema.fromJsonString(PhraseSpansJson));
      expect(yield* encode(spans)).toBe(
        yield* encode(matchRun(PhraseAutomaton.make(PHRASE_FIXTURE_DICTIONARY), DANIEL_8_9)),
      );
    }),
  );
});
