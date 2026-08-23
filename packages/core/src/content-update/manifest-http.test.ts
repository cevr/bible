/** §10 Milestone 9's adapter check, on the leg this process can run.
 *
 *  The fixture in `testing.ts` is one table every host answers. Two of the
 *  three hosts run it here — the CLI's Bun client and Electron main's Node
 *  client both resolve `HttpClient.HttpClient` from this runtime, so the
 *  adapter they share is exercised over both. The browser's leg cannot run
 *  under Bun (there is no same-origin proxy and no `fetch` against one), so it
 *  runs in `apps/web/src/workers/content-round-trip.test.ts` against
 *  the same table.
 *
 *  What is being checked is not "does HTTP work" — it is that the *mapping*
 *  from a response onto §3.6's outcomes is one mapping. Every non-arrival
 *  becomes `offline`, a readable manifest becomes a decision, and an overrun
 *  becomes a refusal, on whichever transport delivered the bytes.
 */

import { Effect, Fiber, Layer, Option } from 'effect';
import * as TestClock from 'effect/testing/TestClock';
import { HttpClient, HttpClientResponse } from 'effect/unstable/http';
import { describe, expect, it } from 'effect-bun-test';

import {
  CONTENT_MANIFEST_MAX_BYTES,
  CONTENT_MANIFEST_MAX_REDIRECTS,
  CONTENT_MANIFEST_ORIGINS,
  CONTENT_MANIFEST_TIMEOUT_MILLIS,
  CONTENT_MANIFEST_URL,
  isAllowedManifestOrigin,
} from './model.js';
import {
  ADAPTER_EXPECTATIONS,
  adapterConformance,
  decisionOverClient,
  fixtureManifestClient,
  FIXTURE_MANIFEST_ORIGINS,
  FIXTURE_MANIFEST_URL,
  FORBIDDEN_MANIFEST_URL,
  OFFERED_MANIFEST_BODY,
  OVERRUN_MANIFEST_BODY,
  OVERRUN_REVISION,
  unreachableManifestClient,
} from './testing.js';

/** A client that answers each address from one routing table, and records the
 *  order it was asked. The addresses are what a redirect case turns on — the
 *  claim is "the second request went where the `Location` header said and
 *  nowhere else", which only the sequence can express. */
interface RoutedClient {
  readonly layer: Layer.Layer<HttpClient.HttpClient>;
  readonly asked: () => readonly string[];
}

const routedClient = (routes: ReadonlyMap<string, Response>): RoutedClient => {
  const asked: string[] = [];
  return {
    asked: () => asked,
    layer: Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) =>
        Effect.sync(() => {
          asked.push(request.url);
          const answer = Option.getOrElse(
            Option.fromUndefinedOr(routes.get(request.url)),
            () => new Response('no such route', { status: 404 }),
          );
          return HttpClientResponse.fromWeb(request, answer.clone());
        }),
      ),
    ),
  };
};

/** A body with **no `Content-Length`**, larger than the cap.
 *
 *  A `ReadableStream` rather than a string: a `Response` built from a string
 *  states its length, and the whole claim is about the case where nothing is
 *  stated (round-4 F4). Chunked in pieces under the cap, so nothing but the
 *  running count can refuse it. */
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

describe('§10 M9 the manifest adapter', () => {
  it.effect('answers the whole cross-host table', () =>
    Effect.gen(function* () {
      // The same single assertion the two host suites make, so the three are
      // comparing against one table rather than three readings of it. The cases
      // below then say *why* each answer is what it is.
      expect(yield* adapterConformance).toEqual(ADAPTER_EXPECTATIONS);
    }),
  );

  it.effect('refuses a schema-major overrun', () =>
    Effect.gen(function* () {
      const decision = yield* decisionOverClient({
        client: fixtureManifestClient({ body: OVERRUN_MANIFEST_BODY }),
      });
      expect(decision._tag).toBe(ADAPTER_EXPECTATIONS.overrun);
      if (decision._tag !== 'refused') return;
      expect(decision.reason).toBe('schema-major');
      // The refused version survives the transport, so the settings entry can
      // name it rather than only saying that something was refused.
      expect(String(decision.available.revision)).toBe(String(OVERRUN_REVISION));
    }),
  );

  it.effect('offers a manifest this build may install', () =>
    Effect.gen(function* () {
      // The other side of the refusal: without this, a host that failed to read
      // *any* manifest would pass the overrun case for the wrong reason.
      const decision = yield* decisionOverClient({
        client: fixtureManifestClient({ body: OFFERED_MANIFEST_BODY }),
      });
      expect(decision._tag).toBe(ADAPTER_EXPECTATIONS.offered);
    }),
  );

  it.effect('reports offline when the host cannot reach the manifest', () =>
    Effect.gen(function* () {
      const decision = yield* decisionOverClient({ client: unreachableManifestClient });
      expect(decision._tag).toBe(ADAPTER_EXPECTATIONS.unreachable);
    }),
  );

  it.effect('reports offline for a non-2xx rather than failing', () =>
    Effect.gen(function* () {
      // The state the web proxy answers before any release is published: the
      // route exists and says 404. §3.6 makes that the pinned floor holding,
      // not a fault the caller has to catch.
      const decision = yield* decisionOverClient({
        client: fixtureManifestClient({ body: 'no manifest is published', status: 404 }),
      });
      expect(decision._tag).toBe(ADAPTER_EXPECTATIONS.notFound);
      if (decision._tag !== 'offline') return;
      expect(decision.detail).toContain('404');
    }),
  );

  it.effect('reports offline for a body that is not a manifest', () =>
    Effect.gen(function* () {
      // A proxy that answered 200 with an HTML error page, or a manifest from a
      // format this build cannot read. Both are "no manifest arrived", and
      // neither may be allowed to reach `decideUpdate` as data.
      const decision = yield* decisionOverClient({
        client: fixtureManifestClient({ body: '<html>gateway error</html>' }),
      });
      expect(decision._tag).toBe(ADAPTER_EXPECTATIONS.malformed);
    }),
  );

  /** **The origin gate** (round-3 F4).
   *
   *  The manifest address is `Config`-resolved so a test and the desktop e2e
   *  can point a host at a fixture. Unguarded, that made every host — and the
   *  web proxy above all, which fetches server-side and streams the answer to a
   *  browser — fetch whatever that variable named. The gate runs *before* the
   *  request, so the observable is that the client was never called at all. */
  it.effect('refuses an address outside the allowed release origins, without fetching', () =>
    Effect.gen(function* () {
      let requests = 0;
      const counting: Layer.Layer<HttpClient.HttpClient> = Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.sync(() => {
            requests += 1;
            return HttpClientResponse.fromWeb(request, new Response(OFFERED_MANIFEST_BODY));
          }),
        ),
      );

      const decision = yield* decisionOverClient({
        client: counting,
        url: FORBIDDEN_MANIFEST_URL,
      });

      expect(decision._tag).toBe('offline');
      if (decision._tag !== 'offline') return;
      expect(decision.detail).toContain('allowed release origin');
      // Not fetched, not merely discarded: a proxy that made the request and
      // then dropped the answer would still be a request an attacker caused.
      expect(requests).toBe(0);
    }),
  );

  /** A hostname that *contains* the release host but is not it — the classic
   *  form of a prefix comparison going wrong. The check is on the parsed
   *  origin, so this is refused like any other foreign address. */
  it.effect('refuses a hostname that only looks like the release host', () =>
    Effect.gen(function* () {
      const decision = yield* decisionOverClient({
        client: fixtureManifestClient({ body: OFFERED_MANIFEST_BODY }),
        url: 'https://github.com.attacker.test/manifest.json',
      });
      expect(decision._tag).toBe('offline');
    }),
  );

  /** The production pin itself passes the gate — otherwise the allowlist would
   *  be a rule that refuses everything, including what ships. */
  it.effect('admits the pinned release URL', () =>
    Effect.sync(() => {
      expect(isAllowedManifestOrigin(CONTENT_MANIFEST_URL)).toBe(true);
    }),
  );

  /** **The size cap** (round-3 F4). An upstream that declares a body larger
   *  than any manifest this format can produce is refused before a byte of it
   *  is read — a bound on what a compromised or confused release host can make
   *  a client (or the proxy) hold in memory. */
  it.effect('refuses a manifest whose declared size exceeds the cap, without reading it', () =>
    Effect.gen(function* () {
      const oversized: Layer.Layer<HttpClient.HttpClient> = Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(OFFERED_MANIFEST_BODY, {
                headers: {
                  'content-length': String(CONTENT_MANIFEST_MAX_BYTES + 1),
                },
              }),
            ),
          ),
        ),
      );

      const decision = yield* decisionOverClient({ client: oversized });
      expect(decision._tag).toBe('offline');
      if (decision._tag !== 'offline') return;
      expect(decision.detail).toContain('size');
    }),
  );

  /** A body at the cap is still read: the bound is on what is *above* it, and a
   *  cap that refused the limit itself would be an off-by-one that only ever
   *  showed up on a real manifest. */
  it.effect('reads a manifest whose declared size is exactly the cap', () =>
    Effect.gen(function* () {
      const atCap: Layer.Layer<HttpClient.HttpClient> = Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(OFFERED_MANIFEST_BODY, {
                headers: { 'content-length': String(CONTENT_MANIFEST_MAX_BYTES) },
              }),
            ),
          ),
        ),
      );

      expect((yield* decisionOverClient({ client: atCap }))._tag).toBe('offer');
    }),
  );

  /** **The timeout** (round-3 F4). §3.6 makes a slow upstream and an absent one
   *  the same outcome, so a socket that never answers becomes `offline` in
   *  bounded time rather than leaving a settings panel suspended forever.
   *
   *  `TestClock` rather than a real wait: what is under test is that the bound
   *  exists and lands on `offline`, and a suite that actually waited ten seconds
   *  would be testing the scheduler. */
  it.effect('reports offline when the manifest read exceeds the timeout', () =>
    Effect.gen(function* () {
      const hanging: Layer.Layer<HttpClient.HttpClient> = Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make(() => Effect.never),
      );

      const running = yield* Effect.forkChild(decisionOverClient({ client: hanging }));
      yield* TestClock.adjust(CONTENT_MANIFEST_TIMEOUT_MILLIS + 1);
      const decision = yield* Fiber.join(running);

      expect(decision._tag).toBe('offline');
      if (decision._tag !== 'offline') return;
      expect(decision.detail).toContain('timed out');
    }),
  );

  it.effect('reports offline for a manifest whose digest is not a sha256', () =>
    Effect.gen(function* () {
      // The trust surface, at the transport seam: a manifest that cannot state
      // a SHA-256 must not decode into an entry the installer would then trust.
      // Written as bytes rather than encoded through `ContentManifest`: the
      // whole claim is that a digest the schema would never produce cannot
      // decode into an entry the installer would trust, and a fixture built by
      // the encoder could not express it.
      const decision = yield* decisionOverClient({
        client: fixtureManifestClient({
          body: '{"revision":"manifest-bad-digest","artifacts":{"topics":{"revision":"content-v4","url":"http://127.0.0.1:64999/topics.db","sha256":"not-a-digest","size":16384,"schema_major":1}}}',
        }),
      });
      expect(decision._tag).toBe('offline');
    }),
  );
  /** **A redirect is followed, once, and only onto the allowlist** (round-4 F4).
   *
   *  The production GitHub URL answers with exactly one hop to the asset host,
   *  so a reader that refused every redirect could never read the shipped
   *  manifest — and the redirect-limit constant this build declares was
   *  unused. The observable is the *sequence*: two requests, the second at the
   *  address the `Location` header named. */
  it.effect('follows one redirect to an allowed origin and reads the manifest there', () =>
    Effect.gen(function* () {
      const target = 'http://127.0.0.1:64999/redirected.json';
      const routed = routedClient(
        new Map([
          [FIXTURE_MANIFEST_URL, new Response('', { status: 302, headers: { location: target } })],
          [target, new Response(OFFERED_MANIFEST_BODY, { status: 200 })],
        ]),
      );

      const decision = yield* decisionOverClient({ client: routed.layer });

      expect(decision._tag).toBe('offer');
      expect(routed.asked()).toEqual([FIXTURE_MANIFEST_URL, target]);
    }),
  );

  /** The other half: a hop off the allowlist is refused at the hop, not
   *  followed and then judged. Without the per-hop check the gate would have
   *  checked one address while the bytes came from another — which is the whole
   *  reason a redirect chain is dangerous to a proxy. */
  it.effect('refuses a redirect that leaves the allowed origins', () =>
    Effect.gen(function* () {
      const routed = routedClient(
        new Map([
          [
            FIXTURE_MANIFEST_URL,
            new Response('', {
              status: 302,
              headers: { location: 'https://manifest.attacker.test/manifest.json' },
            }),
          ],
        ]),
      );

      const decision = yield* decisionOverClient({ client: routed.layer });

      expect(decision._tag).toBe('offline');
      if (decision._tag !== 'offline') return;
      expect(decision.detail).toContain('allowed release origin');
      // The foreign address was never requested — refused at the hop.
      expect(routed.asked()).toEqual([FIXTURE_MANIFEST_URL]);
    }),
  );

  /** A chain longer than this build follows stops at the bound rather than
   *  looping. `CONTENT_MANIFEST_MAX_REDIRECTS` hops are made; the one past it
   *  is not. */
  it.effect('stops following after the redirect bound', () =>
    Effect.gen(function* () {
      const step = (index: number) => `http://127.0.0.1:64999/hop-${String(index)}.json`;
      const routes = new Map<string, Response>([
        [FIXTURE_MANIFEST_URL, new Response('', { status: 302, headers: { location: step(0) } })],
      ]);
      for (let index = 0; index <= CONTENT_MANIFEST_MAX_REDIRECTS; index += 1) {
        routes.set(
          step(index),
          new Response('', { status: 302, headers: { location: step(index + 1) } }),
        );
      }
      const routed = routedClient(routes);

      const decision = yield* decisionOverClient({ client: routed.layer });

      expect(decision._tag).toBe('offline');
      if (decision._tag !== 'offline') return;
      expect(decision.detail).toContain('redirected more times');
      // The first request plus the bound: the hop past it was never made.
      expect(routed.asked().length).toBe(CONTENT_MANIFEST_MAX_REDIRECTS + 1);
    }),
  );

  /** **The counted cap** (round-4 F4). An upstream that declares no length —
   *  every chunked response — could stream an unbounded body into this reader
   *  while the declared-length check above passed vacuously. The bound is on
   *  the bytes actually read. */
  it.effect('refuses an oversized body that declares no content length', () =>
    Effect.gen(function* () {
      const chunked: Layer.Layer<HttpClient.HttpClient> = Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(chunkedBody(CONTENT_MANIFEST_MAX_BYTES * 2), { status: 200 }),
            ),
          ),
        ),
      );

      const decision = yield* decisionOverClient({ client: chunked });

      expect(decision._tag).toBe('offline');
      if (decision._tag !== 'offline') return;
      expect(decision.detail).toContain('size');
    }),
  );

  /** The shipped allowlist admits the release host and **nothing else**
   *  (round-4 F4). Loopback used to be on it so the fixtures would pass, which
   *  meant every install trusted a plaintext local address for a manifest whose
   *  trust surface is HTTPS. The fixtures state their own origins now. */
  it.effect('the production allowlist is the release host alone', () =>
    Effect.sync(() => {
      expect(CONTENT_MANIFEST_ORIGINS).toEqual([new URL(CONTENT_MANIFEST_URL).origin]);
      expect(isAllowedManifestOrigin('http://127.0.0.1:64999/manifest.json')).toBe(false);
      expect(isAllowedManifestOrigin('http://localhost:64999/manifest.json')).toBe(false);
      // And the fixture list is exactly as narrow, one origin over.
      expect(FIXTURE_MANIFEST_ORIGINS).toEqual([new URL(FIXTURE_MANIFEST_URL).origin]);
    }),
  );
});
