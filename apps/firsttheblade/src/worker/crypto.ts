/* oxlint-disable effect/noGlobals -- the Worker's platform adapter for `effect/Crypto`: Web Crypto is the platform here. */
/**
 * `effect/Crypto` in the Worker, over the runtime's Web Crypto: random bytes
 * from `crypto.getRandomValues`, digests from `crypto.subtle.digest`.
 */
import { Crypto, Effect, Layer } from 'effect';

export const layerWebCrypto = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    randomBytes: (size) => crypto.getRandomValues(new Uint8Array(size)),
    digest: (algorithm, data) =>
      Effect.promise(() => crypto.subtle.digest(algorithm, new Uint8Array(data))).pipe(
        Effect.map((digest) => new Uint8Array(digest)),
      ),
  }),
);
