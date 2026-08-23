/** §3.6's runtime artifact, proxied to the browser.
 *
 *  `/api/assets/topics` proxies the release this build was compiled with — one
 *  address, no parameters, and therefore nothing an attacker can steer. The
 *  runtime leg is different in exactly one way: the address comes from a
 *  manifest entry, so it is a *parameter*, and a route that fetches an address
 *  its client supplies is a request-forgery gadget unless the address is
 *  checked. So this route reuses the manifest route's trust rules verbatim —
 *  the same origin allowlist, the same bounded redirect follow with a re-check
 *  on every hop, the same timeout — and adds the one bound an artifact needs
 *  that a manifest does not: a size cap taken from the offer rather than from a
 *  constant.
 *
 *  **Why the browser needed a route at all** (round-4 F1). The worker's supply
 *  was wired with the writings source alone, so accepting an offer resolved
 *  successfully and installed nothing; and even wired, a worker cannot fetch
 *  the release host directly, because GitHub releases send no CORS headers.
 *  Both halves are the same fix: a topics supply whose release source reads
 *  this route.
 */

import {
  CONTENT_MANIFEST_MAX_REDIRECTS,
  CONTENT_MANIFEST_ORIGINS,
  CONTENT_MANIFEST_TIMEOUT_MILLIS,
  isAllowedOrigin,
  redirectTarget,
} from '@bible/core/content-update';
import { Data, Effect, Option, Stream } from 'effect';
import { HttpServerResponse } from 'effect/unstable/http';

/** Every way of not reaching an artifact, as one declared failure — the same
 *  shape and the same reason as the manifest route's. */
class ArtifactUpstreamError extends Data.TaggedError('ArtifactUpstreamError')<{
  readonly cause: unknown;
}> {}

const unavailable = (headers: Record<string, string>) =>
  HttpServerResponse.text('Content artifact unavailable', { status: 502, headers });

/** The request as this route understands it, or nothing.
 *
 *  Both parameters are required, and the size is required *because* it is the
 *  cap: a request that does not say how large the artifact is has not said what
 *  it is asking for, and there is no safe default — the alternative is an
 *  unbounded proxy. The digest is not read here; the installer verifies it
 *  against the bytes, which is where a digest check belongs. */
interface ArtifactRequest {
  readonly url: string;
  readonly size: number;
}

export const artifactRequestFrom = (url: URL): Option.Option<ArtifactRequest> => {
  const address = Option.fromNullOr(url.searchParams.get('url'));
  const declared = Option.fromNullOr(url.searchParams.get('size')).pipe(
    Option.map(Number),
    Option.filter((size) => Number.isSafeInteger(size) && size > 0),
  );
  return Option.zipWith(address, declared, (value, size) => ({ url: value, size }));
};

/** The upstream body, refused the moment it passes the size the offer declared.
 *
 *  Counted rather than declared, for the reason the manifest route counts: a
 *  `Content-Length` is a claim and a chunked response makes no claim at all, so
 *  a header check alone lets any upstream stream an unbounded body through this
 *  server (round-4 F4).
 *
 *  Streamed rather than buffered, unlike the manifest route: an artifact is
 *  hundreds of megabytes, and the cap here is a *limit* on a stream rather than
 *  a ceiling on a buffer. A body that exceeds it fails the stream, and the
 *  browser sees a truncated response that fails its digest check — which is the
 *  correct outcome and the one the installer already handles. */
const bounded = (
  body: ReadableStream<Uint8Array>,
  limit: number,
): Stream.Stream<Uint8Array, ArtifactUpstreamError> =>
  Stream.suspend(() => {
    let read = 0;
    return Stream.fromReadableStream({
      evaluate: () => body,
      onError: (cause) => new ArtifactUpstreamError({ cause }),
    }).pipe(
      Stream.mapEffect((chunk) => {
        read += chunk.byteLength;
        if (read > limit) {
          return Effect.fail(
            new ArtifactUpstreamError({ cause: 'artifact exceeds its declared size' }),
          );
        }
        return Effect.succeed(chunk);
      }),
    );
  });

/** Fetches one runtime artifact for a browser, under this build's trust rules.
 *
 *  `origins` is a parameter for the reason the manifest reader's is: the
 *  shipped allowlist is the release host alone, and a suite pointing this route
 *  at a loopback fixture states that origin rather than shipping it to every
 *  install (round-4 F4). */
export const contentArtifactResponse = Effect.fn('web.contentArtifactResponse')(function* (input: {
  readonly request: ArtifactRequest;
  readonly headers: Record<string, string>;
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  readonly origins?: readonly string[];
}) {
  const origins = input.origins ?? CONTENT_MANIFEST_ORIGINS;

  /** One hop, re-checked — the manifest route's loop, over an artifact. The
   *  re-check per hop is what `HttpClient.followRedirects` does not do, and
   *  what the whole allowlist rests on. */
  const hop = (
    address: string,
    followed: number,
  ): Effect.Effect<Option.Option<Response>, ArtifactUpstreamError> =>
    Effect.gen(function* () {
      // Before anything is fetched: the observable is that no request was made,
      // not that its answer was discarded.
      if (!isAllowedOrigin(address, origins)) return Option.none<Response>();
      const upstream = yield* Effect.tryPromise({
        catch: (cause) => new ArtifactUpstreamError({ cause }),
        try: () =>
          input.fetch(address, {
            redirect: 'manual',
            signal: AbortSignal.timeout(CONTENT_MANIFEST_TIMEOUT_MILLIS),
          }),
      });
      const next = redirectTarget(
        upstream.status,
        Option.fromNullOr(upstream.headers.get('location')),
        address,
      );
      if (Option.isSome(next)) {
        if (followed >= CONTENT_MANIFEST_MAX_REDIRECTS) return Option.none<Response>();
        return yield* hop(next.value, followed + 1);
      }
      if (!upstream.ok) return Option.none<Response>();
      // The declared length, when the upstream states one, against the size the
      // offer declared: refused before a byte is read.
      const declared = Option.fromNullOr(upstream.headers.get('content-length'));
      if (Option.exists(declared, (raw) => Number(raw) > input.request.size)) {
        return Option.none<Response>();
      }
      return Option.some(upstream);
    });

  const upstream = yield* hop(input.request.url, 0).pipe(
    Effect.orElseSucceed(() => Option.none<Response>()),
  );
  const body = Option.flatMap(upstream, (response) => Option.fromNullOr(response.body));
  if (Option.isNone(body)) return unavailable(input.headers);

  return HttpServerResponse.stream(bounded(body.value, input.request.size), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(input.request.size),
      ...input.headers,
    },
  });
});
