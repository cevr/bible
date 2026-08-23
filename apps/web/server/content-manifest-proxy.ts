/** §3.6's runtime manifest, proxied to the browser.
 *
 *  The worker cannot reach the release host directly — GitHub releases send no
 *  CORS headers — so the browser's leg of §3.6 goes through this same-origin
 *  route. The body crosses as **bytes, unparsed**: the decision module in the
 *  worker owns the schema, and a server that understood the manifest would be a
 *  second place for the format to drift.
 *
 *  Its own module rather than an arm of the entry file's router, because this
 *  route carries the whole server-side half of §3.6's trust surface — an origin
 *  gate, a bounded redirect follow, a counted size cap and a timeout — and a
 *  route that a test cannot reach is a trust surface nothing checks. `main.ts`
 *  mounts it; the web worker's round-trip suite runs its real client at it
 *  (round-3 F4, F5; round-4 F4).
 */

import {
  CONTENT_MANIFEST_MAX_BYTES,
  CONTENT_MANIFEST_MAX_REDIRECTS,
  CONTENT_MANIFEST_ORIGINS,
  CONTENT_MANIFEST_TIMEOUT_MILLIS,
  isAllowedOrigin,
  redirectTarget,
} from '@bible/core/content-update';
import { Data, Effect, Option, Stream } from 'effect';
import { HttpServerResponse } from 'effect/unstable/http';

/** Everything that can go wrong reaching an upstream, as one declared failure.
 *
 *  Named rather than `unknown` because the route's whole posture is that every
 *  non-arrival is one answer — a 502 and, to the browser, one `offline`
 *  decision (§3.6). A typed failure is what lets the catch below be by name
 *  instead of a blanket cause catch. */
class ManifestUpstreamError extends Data.TaggedError('ManifestUpstreamError')<{
  readonly cause: unknown;
}> {}

/** Every non-arrival answers the same way.
 *
 *  There is no 404 arm and no distinct code per cause: unlike the artifact
 *  routes there is no compiled "is a release published" flag to consult, and
 *  every way of not getting a manifest — refused origin, dead upstream, a
 *  redirect off the allowlist, an oversized body, a timeout — reaches the
 *  client as one `offline` decision (§3.6). So the status only has to say "not
 *  a manifest", which 502 already does, and saying more would leak which of
 *  those the upstream did. */
const unavailable = (headers: Record<string, string>) =>
  HttpServerResponse.text('Content manifest unavailable', { status: 502, headers });

/** The bytes of one upstream response, refused above the cap.
 *
 *  Counted rather than declared. `Content-Length` is a claim, and a chunked
 *  response makes no claim at all — so trusting the header let any upstream
 *  that omitted it stream an unbounded body through this server and into a
 *  browser (round-4 F4). The declared length is still checked first, because
 *  refusing before a byte moves is better than refusing after.
 *
 *  Buffered rather than piped, which is the price of the bound: the cap is
 *  256 KiB, three orders of magnitude above any manifest this format produces,
 *  so what is held is bounded by construction. */
interface BodyFold {
  readonly chunks: readonly Uint8Array[];
  readonly read: number;
  readonly overflowed: boolean;
}

const boundedBytes = (
  body: ReadableStream<Uint8Array>,
): Effect.Effect<Option.Option<Uint8Array>, ManifestUpstreamError> =>
  Stream.fromReadableStream({
    evaluate: () => body,
    onError: (cause) => new ManifestUpstreamError({ cause }),
  }).pipe(
    Stream.runFold(
      (): BodyFold => ({ chunks: [], read: 0, overflowed: false }),
      (state: BodyFold, chunk: Uint8Array): BodyFold => {
        const read = state.read + chunk.byteLength;
        if (read > CONTENT_MANIFEST_MAX_BYTES) return { chunks: [], read, overflowed: true };
        return { chunks: [...state.chunks, chunk], read, overflowed: false };
      },
    ),
    Effect.map((state) => {
      if (state.overflowed) return Option.none<Uint8Array>();
      const whole = new Uint8Array(state.read);
      let offset = 0;
      for (const chunk of state.chunks) {
        whole.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return Option.some(whole);
    }),
  );

/** Fetches the manifest for a browser, under this build's trust rules.
 *
 *  `url` is `Config`-resolved so a test and the desktop e2e can point a host at
 *  a fixture — which is exactly why the gate exists (round-3 F4). This route
 *  fetches **server-side** and streams the answer to a browser, so an unchecked
 *  address made it a request-forgery gadget: whatever could set that variable
 *  could make this server reach an arbitrary host and hand back the result.
 *
 *  `origins` is a parameter for the same reason the reader's is: the shipped
 *  allowlist is the release host alone, and a suite pointing this route at a
 *  loopback fixture states that origin rather than shipping it to every install
 *  (round-4 F4). */
export const contentManifestResponse = Effect.fn('web.contentManifestResponse')(function* (input: {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  readonly origins?: readonly string[];
}) {
  const origins = input.origins ?? CONTENT_MANIFEST_ORIGINS;

  /** One hop, re-checked. `manual` is what makes this loop the only follower:
   *  left to `fetch`, a redirect chain would walk this server off the origin
   *  the gate just checked, to any host the upstream named. GitHub releases
   *  answer with exactly one hop, so refusing every redirect broke the
   *  production path instead (round-4 F4). */
  const hop = (
    address: string,
    followed: number,
  ): Effect.Effect<Option.Option<Uint8Array>, ManifestUpstreamError> =>
    Effect.gen(function* () {
      // Before anything is fetched: the observable is that no request was made,
      // not that its answer was discarded.
      if (!isAllowedOrigin(address, origins)) return Option.none<Uint8Array>();
      const upstream = yield* Effect.tryPromise({
        catch: (cause) => new ManifestUpstreamError({ cause }),
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
        if (followed >= CONTENT_MANIFEST_MAX_REDIRECTS) return Option.none<Uint8Array>();
        return yield* hop(next.value, followed + 1);
      }
      if (!upstream.ok) return Option.none<Uint8Array>();
      // The declared length, when the upstream states one: refused before it is
      // read at all.
      const declared = Option.fromNullOr(upstream.headers.get('content-length'));
      if (Option.exists(declared, (raw) => Number(raw) > CONTENT_MANIFEST_MAX_BYTES)) {
        return Option.none<Uint8Array>();
      }
      const body = Option.fromNullOr(upstream.body);
      if (Option.isNone(body)) return Option.none<Uint8Array>();
      return yield* boundedBytes(body.value);
    });

  const bytes = yield* hop(input.url, 0).pipe(
    Effect.orElseSucceed(() => Option.none<Uint8Array>()),
  );
  if (Option.isNone(bytes)) return unavailable(input.headers);

  return HttpServerResponse.uint8Array(bytes.value, {
    headers: { 'Content-Type': 'application/json', ...input.headers },
  });
});
