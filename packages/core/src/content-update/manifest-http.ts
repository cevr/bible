/** The manifest read over HTTP, written once for all three hosts.
 *
 *  §10 M9's adapter check asks that "web fetches the manifest through the
 *  same-origin proxy; Electron main fetches directly; CLI fetches under Bun.
 *  All three refuse the same schema-major overrun." The refusal is
 *  `decideUpdate`'s, in portable core, so it is one rule by construction. What
 *  is left for the adapters is the URL and the `HttpClient` implementation —
 *  and both are parameters here rather than three copies of a fetch.
 *
 *  Portable: it takes `HttpClient.HttpClient` from context, which
 *  `BunHttpClient`, `NodeHttpClient` and `FetchHttpClient` all provide. The
 *  browser's *own* difference is the URL, not the client: it reads a
 *  same-origin proxy route because it cannot reach the release host directly
 *  (no CORS), exactly as `/api/assets/topics` already works.
 *
 *  **It never fails.** Every way a manifest can fail to arrive — no network, a
 *  non-2xx, bytes that are not a manifest this build can decode — becomes
 *  `unavailable`, because §3.6's offline rule is that the pinned floor stands
 *  with no error. That is also why there is no blanket cause catch: the
 *  failures are declared (`HttpClientError`, `SchemaError`) and caught by name,
 *  so a defect in a host's client still reaches the operator. */

import { Config, Effect, Layer, Option, Schema, Stream } from 'effect';
import { FetchHttpClient, Headers, HttpClient } from 'effect/unstable/http';
import type { HttpClientError } from 'effect/unstable/http';

import {
  CONTENT_MANIFEST_MAX_BYTES,
  CONTENT_MANIFEST_MAX_REDIRECTS,
  CONTENT_MANIFEST_ORIGINS,
  CONTENT_MANIFEST_TIMEOUT_MILLIS,
  CONTENT_MANIFEST_URL,
  ContentManifest,
  isAllowedOrigin,
  manifestFetched,
  manifestUnavailable,
  redirectTarget,
  type ManifestFetchOutcome,
} from './model.js';
import { ContentManifestSource } from './service.js';

/** Where this host reads the manifest, as an overridable pin.
 *
 *  §3.6 fixes one stable URL; `Config` is what lets a test — and the desktop
 *  e2e — point a host at a local fixture without the adapter growing a
 *  test-only branch, and what §12 leaves open ("the exact URL") without leaving
 *  the mechanism open. */
export const contentManifestUrl: Config.Config<string> = Config.String(
  'BIBLE_CONTENT_MANIFEST_URL',
).pipe(Config.withDefault(CONTENT_MANIFEST_URL));

const decodeManifest = Schema.decodeUnknownEffect(Schema.fromJsonString(ContentManifest));

/** Every redirect this reader follows is followed **here**, never by the
 *  transport.
 *
 *  `fetch` defaults to `redirect: "follow"`, so a `FetchHttpClient` would walk a
 *  redirect chain to any host in the world before this module saw a single
 *  response — the origin gate would have checked one address and the bytes
 *  would have come from another (round-4 F4). `undici` under `NodeHttpClient`
 *  does not follow at all, so the two hosts disagreed about the production
 *  GitHub URL as well: one followed it anywhere, the other refused the one hop
 *  releases actually answer with.
 *
 *  Pinning `manual` on the fetch options makes the hop loop below the only
 *  follower on every host, which is what makes "one redirect, to an allowlisted
 *  origin" one rule rather than three transports' defaults. It is inert on a
 *  client that is not fetch-based. */
const manualRedirects = Effect.provideService(FetchHttpClient.RequestInit, {
  redirect: 'manual',
});

/** How many bytes of a body this reader will hold, **counted rather than
 *  declared**.
 *
 *  `Content-Length` is a claim by the upstream, and a chunked response makes no
 *  claim at all — so a reader that trusted the header read an unbounded body
 *  from any upstream that simply omitted it (round-4 F4). The declared length
 *  is still checked first, because refusing before a byte moves is better than
 *  refusing after; this is the bound that holds when there is nothing to check.
 *
 *  It fails on the first chunk that crosses the cap rather than after the body
 *  is whole, so the memory bound is the cap and not the body. */
interface BodyFold {
  readonly chunks: readonly Uint8Array[];
  readonly read: number;
  readonly overflowed: boolean;
}

const boundedBody = (
  stream: Stream.Stream<Uint8Array, HttpClientError.HttpClientError>,
): Effect.Effect<Option.Option<string>, HttpClientError.HttpClientError> =>
  stream.pipe(
    Stream.runFold(
      (): BodyFold => ({ chunks: [], read: 0, overflowed: false }),
      (state: BodyFold, chunk: Uint8Array): BodyFold => {
        const read = state.read + chunk.byteLength;
        if (read > CONTENT_MANIFEST_MAX_BYTES) {
          return { chunks: [], read, overflowed: true };
        }
        return { chunks: [...state.chunks, chunk], read, overflowed: false };
      },
    ),
    Effect.map((state) => {
      if (state.overflowed) return Option.none<string>();
      const body = new Uint8Array(state.read);
      let offset = 0;
      for (const chunk of state.chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return Option.some(new TextDecoder().decode(body));
    }),
  );

/** One manifest read, over whichever `HttpClient` the host provides.
 *
 *  Four bounds, all of them landing on the same `unavailable` outcome:
 *
 *  - **Origin.** The address is checked against the caller's allowlist before
 *    the request is made, and again at **every redirect hop**. The URL is
 *    `Config`-resolved so a test and the desktop e2e can point a host at a
 *    fixture, and unguarded that made every host — the proxy most of all —
 *    fetch whatever that variable named (round-3 F4).
 *  - **Redirects.** Up to {@link CONTENT_MANIFEST_MAX_REDIRECTS} hops, each one
 *    re-checked against the same allowlist. GitHub releases answer with exactly
 *    one hop, so refusing all of them broke the production path; following them
 *    blindly would have walked the fetch off the origin the gate just checked.
 *  - **Size.** Declared length when the upstream states one, and the streamed
 *    byte count regardless — see {@link boundedBody}.
 *  - **Time.** §3.6 makes a slow upstream and an absent one the same outcome, so
 *    a hung socket becomes `offline` in bounded time rather than leaving a
 *    settings panel suspended.
 *
 *  **It never fails.** Every bound is a value, for the same reason every
 *  transport failure is: the pinned floor stands, and a caller that had to
 *  catch would be catching an expected state. */
export const readManifestOver = (
  url: string,
  origins: readonly string[] = CONTENT_MANIFEST_ORIGINS,
): Effect.Effect<ManifestFetchOutcome, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const hop = (
      address: string,
      followed: number,
    ): Effect.Effect<
      ManifestFetchOutcome,
      HttpClientError.HttpClientError | Schema.SchemaError,
      HttpClient.HttpClient
    > =>
      Effect.gen(function* () {
        if (!isAllowedOrigin(address, origins)) {
          return manifestUnavailable('manifest address is not an allowed release origin');
        }
        const response = yield* HttpClient.get(address);
        // A redirect is followed by this loop and by nothing else, so the hop
        // it lands on is checked by the same gate the first address was.
        const next = redirectTarget(
          response.status,
          Headers.get(response.headers, 'location'),
          address,
        );
        if (Option.isSome(next)) {
          if (followed >= CONTENT_MANIFEST_MAX_REDIRECTS) {
            return manifestUnavailable('manifest redirected more times than this build follows');
          }
          return yield* hop(next.value, followed + 1);
        }
        if (response.status < 200 || response.status >= 300) {
          return manifestUnavailable(`manifest responded HTTP ${String(response.status)}`);
        }
        const declared = Option.flatMap(Headers.get(response.headers, 'content-length'), (raw) =>
          // `decodeOption` rather than the unknown form: the input is already a
          // number, and what the schema is being asked is whether it is an
          // *integer* — a header of `abc` gives `NaN` and is refused here.
          Schema.decodeOption(Schema.Int)(Number(raw)),
        );
        if (Option.exists(declared, (length) => length > CONTENT_MANIFEST_MAX_BYTES)) {
          return manifestUnavailable('manifest body exceeds the size this build will read');
        }
        const body = yield* boundedBody(response.stream);
        if (Option.isNone(body)) {
          return manifestUnavailable('manifest body exceeds the size this build will read');
        }
        return manifestFetched(yield* decodeManifest(body.value));
      });
    return yield* hop(url, 0);
  }).pipe(
    manualRedirects,
    Effect.timeoutOrElse({
      duration: CONTENT_MANIFEST_TIMEOUT_MILLIS,
      orElse: () => Effect.succeed(manifestUnavailable('manifest read timed out')),
    }),
    // Declared failures only, by name. A request that did not complete and a
    // body that is not a manifest are the same outcome to every caller — the
    // pinned floor stands — and neither is an error channel (§3.6).
    Effect.catchTags({
      HttpClientError: (cause) =>
        Effect.succeed(manifestUnavailable(`manifest unreachable: ${cause.reason._tag}`)),
      SchemaError: () =>
        Effect.succeed(
          manifestUnavailable('manifest body is not a content manifest this build can read'),
        ),
    }),
    Effect.scoped,
  );

/** The HTTP manifest source at a URL the host already knows.
 *
 *  For the browser, where the URL is not configuration: a worker reads
 *  `/api/content/manifest` because that is the only address it *can* read (no
 *  CORS to the release host), the same way it reads `/api/assets/topics`. Going
 *  through `Config` there would mean seeding an environment a browser does not
 *  have, to re-derive a constant the host already holds. */
export const layerHttpContentManifestAt = (
  url: string,
  origins?: readonly string[],
): Layer.Layer<ContentManifestSource, never, HttpClient.HttpClient> =>
  Layer.effect(
    ContentManifestSource,
    Effect.map(HttpClient.HttpClient, (client) =>
      ContentManifestSource.of({
        read: readManifestOver(url, origins).pipe(
          Effect.provideService(HttpClient.HttpClient, client),
        ),
      }),
    ),
  );

/** The HTTP manifest source, over the host's own `HttpClient` and the
 *  `Config`-resolved URL. Every host with an environment wires this one; only
 *  the client underneath it differs. */
export const layerHttpContentManifest: Layer.Layer<
  ContentManifestSource,
  never,
  HttpClient.HttpClient
> = Layer.effect(
  ContentManifestSource,
  Effect.gen(function* () {
    const url = yield* contentManifestUrl;
    const client = yield* HttpClient.HttpClient;
    return ContentManifestSource.of({
      read: readManifestOver(url).pipe(Effect.provideService(HttpClient.HttpClient, client)),
    });
  }).pipe(
    // A `Config` that cannot be read is a host misconfiguration, not a content
    // state. It dies rather than silently reporting "offline" — which would
    // hide a typo'd environment variable behind a state that looks normal.
    Effect.orDie,
  ),
);
