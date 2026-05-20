/**
 * EGW token persistence port.
 *
 * `EGWAuth` needs somewhere to cache the OAuth access token between runs so
 * it doesn't hit /connect/token on every request. The "where" depends on the
 * host process:
 *   - CLI / sync workers: filesystem (data/tokens.json next to the binary)
 *   - Electron renderer: IPC bridge to the main process (no Node FS access)
 *   - Tests: in-memory ref
 *
 * Split out so each host wires its own layer. Without this split, EGWAuth.Live
 * would need a FileSystem + Path, which forces the renderer to ship a fake FS
 * shim that lies about non-token operations. Cleaner to make persistence the
 * explicit pluggable surface.
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

const toAccessToken = (parsed: typeof PersistedToken.Type): AccessToken =>
  new AccessToken({
    accessToken: Redacted.make(parsed.accessToken),
    refreshToken:
      parsed.refreshToken !== undefined ? Redacted.make(parsed.refreshToken) : undefined,
    expiresAt: parsed.expiresAt,
    scope: parsed.scope,
  });

const toPersisted = (token: AccessToken): typeof PersistedToken.Type => ({
  accessToken: Redacted.value(token.accessToken),
  refreshToken: token.refreshToken !== undefined ? Redacted.value(token.refreshToken) : undefined,
  expiresAt: token.expiresAt,
  scope: token.scope,
});

export interface EGWTokenStoreShape {
  readonly read: Effect.Effect<Option.Option<AccessToken>, Schema.SchemaError | PlatformError>;
  readonly write: (token: AccessToken) => Effect.Effect<void, Schema.SchemaError | PlatformError>;
}

export class EGWTokenStore extends Context.Service<EGWTokenStore, EGWTokenStoreShape>()(
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

        return {
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
        };
      }),
    );

  /**
   * Adapter for hosts that already have a JSON string read/write port (e.g.
   * the Electron renderer reaching through an IPC bridge). Pass the two raw
   * effects and EGWTokenStore handles the schema marshaling.
   */
  static layerFromJsonPort = (port: {
    readonly readJson: Effect.Effect<Option.Option<string>>;
    readonly writeJson: (json: string) => Effect.Effect<void>;
  }) =>
    Layer.succeed(EGWTokenStore, {
      read: Effect.gen(function* () {
        const text = yield* port.readJson;
        if (Option.isNone(text)) return Option.none<AccessToken>();
        const parsed = yield* decodePersisted(text.value);
        return Option.some(toAccessToken(parsed));
      }),
      write: (token) =>
        Effect.gen(function* () {
          const json = yield* encodePersisted(toPersisted(token));
          yield* port.writeJson(json);
        }),
    });

  /** In-memory test layer. */
  static layerTest = (initial: Option.Option<AccessToken> = Option.none()) =>
    Layer.effect(
      EGWTokenStore,
      Effect.gen(function* () {
        const ref = yield* Ref.make(initial);
        return {
          read: Ref.get(ref),
          write: (token) => Ref.set(ref, Option.some(token)),
        };
      }),
    );
}
