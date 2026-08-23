/** §10 Milestone 9's adapter check over a **real transport** (round-3 F5).
 *
 *  `manifest-http.test.ts` runs the fixture table through stub clients. That
 *  proves the mapping from a response onto §3.6's outcomes, and nothing about
 *  the client that produces the response — a stub has no socket, no status
 *  line and no header parsing, so a host whose shipped `HttpClient` mishandled
 *  any of them passed anyway. Milestone 9's claim is about the three shipped
 *  transports, so the table has to reach at least one of them for real.
 *
 *  This is the Bun leg: the client the CLI composes, against a Bun HTTP server
 *  on loopback. Electron main's Node leg is
 *  `apps/desktop/tests/content-round-trip.test.ts`; the browser's leg, which
 *  reaches the manifest through the server's same-origin proxy, is
 *  `apps/web/src/workers/content-round-trip.test.ts`. All three compare against
 *  the one `ADAPTER_EXPECTATIONS`.
 */

import { Effect, Option } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { describe, expect, it } from 'effect-bun-test';

import { ADAPTER_EXPECTATIONS, ADAPTER_ROUTES, liveAdapterConformance } from './testing.js';

/** The fixture cases as an actual origin. Bound to loopback, which is also what
 *  lets it past the origin gate — a fixture server on any other host would be
 *  refused before the request and every case would read `offline`. */
const serveFixtures = Effect.acquireRelease(
  Effect.sync(() => {
    const routes = new Map(ADAPTER_ROUTES);
    // oxlint-disable-next-line effect/noGlobals -- the point of this suite is a real socket, not a platform service over one
    return Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: (request) => {
        const route = Option.fromUndefinedOr(routes.get(new URL(request.url).pathname));
        return Option.match(route, {
          onNone: () => new Response('no such fixture', { status: 404 }),
          onSome: (found) => new Response(found.body, { status: found.status }),
        });
      },
    });
  }),
  (server) => Effect.promise(() => server.stop(true)),
);

describe('§10 M9 the manifest adapter, over Bun’s real HTTP client', () => {
  it.scopedLive('answers the whole cross-host table over a real socket', () =>
    Effect.gen(function* () {
      const server = yield* serveFixtures;
      const table = yield* liveAdapterConformance({
        // The client the CLI actually composes — not a stub, and not a client
        // built for the test.
        client: FetchHttpClient.layer,
        baseUrl: `http://127.0.0.1:${String(server.port)}`,
        // A port on the same loopback host with nothing bound: the origin gate
        // admits it, so what answers `offline` is the transport failing to
        // connect rather than the address being refused.
        closedUrl: 'http://127.0.0.1:1/manifest.json',
      });
      expect(table).toEqual(ADAPTER_EXPECTATIONS);
    }),
  );
});
