/**
 * EGW token persistence port.
 *
 * `EGWAuth` needs somewhere to cache the OAuth access token between runs so
 * it doesn't hit /connect/token on every request. The "where" depends on the
 * host process:
 *   - CLI / sync workers: filesystem (data/tokens.json next to the binary)
 *   - Tests: in-memory ref
 *
 * Split out so each host wires its own layer, and persistence is the explicit
 * pluggable surface.
 */

import { Context, Effect, FileSystem, Layer, Option, Path, Redacted, Ref, Schema } from 'effect';
import type { PlatformError } from 'effect/PlatformError';

import { AccessToken } from './auth-types.js';

// On-disk shape — secrets as plain strings so they round-trip through JSON.
// Re-wrapped as Redacted on read.
const PersistedToken = Schema.Struct({
  accessToken: Schema.NonEmptyString,
  refreshToken: Schema.optional(Schema.NonEmptyString),
  expiresAt: Schema.Int,
  scope: Schema.String,
});

const decodePersisted = Schema.decodeEffect(Schema.fromJsonString(PersistedToken));
const encodePersisted = Schema.encodeEffect(Schema.fromJsonString(PersistedToken));

const optionalRedacted = (value: Option.Option<string>) =>
  Option.getOrUndefined(Option.map(value, Redacted.make));

const toAccessToken = (parsed: typeof PersistedToken.Type): AccessToken =>
  AccessToken.make({
    accessToken: Redacted.make(parsed.accessToken),
    refreshToken: optionalRedacted(Option.fromNullishOr(parsed.refreshToken)),
    expiresAt: parsed.expiresAt,
    scope: parsed.scope,
  });

const toPersisted = (token: AccessToken): typeof PersistedToken.Type => {
  const refreshToken = Option.fromNullishOr(token.refreshToken).pipe(Option.map(Redacted.value));
  return {
    accessToken: Redacted.value(token.accessToken),
    refreshToken: Option.getOrUndefined(refreshToken),
    expiresAt: token.expiresAt,
    scope: token.scope,
  };
};

export interface EGWTokenStoreService {
  readonly read: Effect.Effect<Option.Option<AccessToken>, Schema.SchemaError | PlatformError>;
  readonly write: (token: AccessToken) => Effect.Effect<void, Schema.SchemaError | PlatformError>;
}

export class EGWTokenStore extends Context.Service<EGWTokenStore, EGWTokenStoreService>()(
  '@bible/core/egw/token-store/EGWTokenStore',
) {
  /**
   * Filesystem-backed token store. Writes JSON to `tokenFile` (resolved against
   * cwd if relative); ensures the parent directory exists on construction.
   */
  static layerFileSystem = (tokenFile: string) =>
    Layer.effect(
      EGWTokenStore,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const tokenFilePath = path.resolve(tokenFile);
        yield* fs
          .makeDirectory(path.dirname(tokenFilePath), { recursive: true })
          .pipe(Effect.orDie);

        return EGWTokenStore.of({
          read: Effect.gen(function* () {
            const exists = yield* fs.exists(tokenFilePath);
            if (!exists) return Option.none<AccessToken>();
            const json = yield* fs.readFileString(tokenFilePath, 'utf-8');
            const parsed = yield* decodePersisted(json);
            return Option.some(toAccessToken(parsed));
          }),
          write: (token) =>
            Effect.gen(function* () {
              const json = yield* encodePersisted(toPersisted(token));
              yield* fs.writeFileString(tokenFilePath, json);
            }),
        });
      }),
    );

  /** In-memory test layer. */
  static layerTest = (initial: Option.Option<AccessToken> = Option.none()) =>
    Layer.effect(
      EGWTokenStore,
      Effect.gen(function* () {
        const ref = yield* Ref.make(initial);
        return EGWTokenStore.of({
          read: Ref.get(ref),
          write: (token) => Ref.set(ref, Option.some(token)),
        });
      }),
    );
}
