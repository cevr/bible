/**
 * EGW Authentication Service using Effect-TS
 * Adapted from Spotify auth patterns with Effect-TS
 */

import type { HttpClientError } from 'effect/unstable/http';
import {
  HttpBody,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  UrlParams,
} from 'effect/unstable/http';
import type { PlatformError } from 'effect/PlatformError';
import type { FileSystem, Path } from 'effect';
import {
  Clock,
  Config,
  Context,
  Duration,
  Effect,
  Layer,
  Option,
  Predicate,
  Redacted,
  Schedule,
  Schema,
  SynchronizedRef,
} from 'effect';

import { AccessToken } from './auth-types.js';
import {
  bakedAuthBaseUrl,
  bakedClientId,
  bakedClientSecret,
  bakedScope,
  envVar,
} from './build-defines.js';
import { EGWTokenStore } from './token-store.js';

export { AccessToken } from './auth-types.js';

/**
 * EGW Auth Errors
 */
export class EGWAuthError extends Schema.TaggedError<EGWAuthError>()('EGWAuthError', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {}

/**
 * OAuth Token Response from API
 */
const OAuthTokenResponse = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.optional(Schema.String),
  token_type: Schema.String,
  expires_in: Schema.Finite,
  scope: Schema.String,
});

const RequestLogBody = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown));
const decodeRequestLogBody = Schema.decodeUnknownOption(RequestLogBody);
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/**
 * Transform OAuth token response to AccessToken
 */
const decodeOAuthToAccessToken = (
  encoded: typeof OAuthTokenResponse.Type,
): Effect.Effect<AccessToken> =>
  Effect.gen(function* () {
    const createdAt = yield* Clock.currentTimeMillis;
    const expiresIn = encoded.expires_in * 1000;
    const refreshToken = Option.fromNullishOr(encoded.refresh_token).pipe(
      Option.map(Redacted.make),
    );
    return AccessToken.make({
      accessToken: Redacted.make(encoded.access_token),
      refreshToken: Option.getOrUndefined(refreshToken),
      expiresAt: createdAt + expiresIn,
      scope: encoded.scope,
    });
  });

// ============================================================================
// Service Interface
// ============================================================================

/**
 * EGW Auth service interface.
 */
export interface EGWAuthService {
  readonly getToken: Effect.Effect<AccessToken>;
}

// ============================================================================
// Service Definition
// ============================================================================

/**
 * EGW Authentication Service
 */
export class EGWAuth extends Context.Service<EGWAuth, EGWAuthService>()(
  '@bible/core/egw/auth/EGWAuth',
) {
  /**
   * Live implementation using OAuth2 client credentials flow.
   */
  static Live: Layer.Layer<
    EGWAuth,
    | Config.ConfigError
    | PlatformError
    | Schema.SchemaError
    | HttpClientError.HttpClientError
    | EGWAuthError,
    EGWTokenStore | HttpClient.HttpClient
  > = Layer.effect(
    EGWAuth,
    Effect.gen(function* () {
      // Defaults pull from baked-in build constants first (renderer bundles
      // get string-literal substitution via Vite/esbuild `define`), then fall
      // back to `envVar()` (a process-safe wrapper) so node-side hosts that
      // load `.env` at runtime (CLI, sync workers, tests) keep working. Bare
      // `process.env` reads would throw ReferenceError in the renderer.
      const authBaseUrl = yield* Config.string('EGW_AUTH_BASE_URL').pipe(
        Config.withDefault(
          bakedAuthBaseUrl().pipe(
            Option.orElse(() => envVar('EGW_AUTH_BASE_URL')),
            Option.getOrElse(() => 'https://cpanel.egwwritings.org'),
          ),
        ),
      );
      const clientId = yield* Config.string('EGW_CLIENT_ID').pipe(
        Config.withDefault(
          bakedClientId().pipe(
            Option.orElse(() => envVar('EGW_CLIENT_ID')),
            Option.getOrElse(() => ''),
          ),
        ),
      );
      const clientSecret = yield* Config.redacted('EGW_CLIENT_SECRET').pipe(
        Config.withDefault(
          Redacted.make(
            bakedClientSecret().pipe(
              Option.orElse(() => envVar('EGW_CLIENT_SECRET')),
              Option.getOrElse(() => ''),
            ),
          ),
        ),
      );
      const scope = yield* Config.string('EGW_SCOPE').pipe(
        Config.withDefault(
          bakedScope().pipe(
            Option.orElse(() => envVar('EGW_SCOPE')),
            Option.getOrElse(() => 'writings search studycenter subscriptions user_info'),
          ),
        ),
      );
      if (!clientId || !Redacted.value(clientSecret)) {
        return yield* EGWAuthError.make({
          message:
            'EGW_CLIENT_ID and EGW_CLIENT_SECRET must be set (check packages/cli/.env or env)',
        });
      }

      const tokenStore = yield* EGWTokenStore;
      const readTokenFromCache = () => tokenStore.read;
      const writeTokenToCache = (token: AccessToken) => tokenStore.write(token);

      const httpClient = (yield* HttpClient.HttpClient).pipe(
        HttpClient.mapRequest((request) =>
          request.pipe(
            HttpClientRequest.prependUrl(authBaseUrl),
            HttpClientRequest.basicAuth(clientId, Redacted.value(clientSecret)),
            HttpClientRequest.acceptJson,
          ),
        ),
        HttpClient.tapRequest((request) => {
          if (request.body._tag === 'Uint8Array' && request.body.contentType.includes('json')) {
            const text = new TextDecoder().decode(request.body.body);
            const decoded = decodeRequestLogBody(text);
            if (Option.isSome(decoded)) {
              const json = decoded.value;
              let clientSecret = Option.none<string>();
              if (json['client_secret']) clientSecret = Option.some('[REDACTED]');
              let refreshToken = Option.none<string>();
              if (json['refresh_token']) refreshToken = Option.some('[REDACTED]');
              const maskedJson = {
                ...json,
                client_secret: Option.getOrUndefined(clientSecret),
                refresh_token: Option.getOrUndefined(refreshToken),
              };
              return Effect.log(`-> req ${request.method} ${request.url}`, encodeJson(maskedJson));
            }
            return Effect.log(`-> req ${request.method} ${request.url}`);
          }
          return Effect.log(`-> req ${request.method} ${request.url}`);
        }),
        HttpClient.transformResponse((responseEffect) =>
          responseEffect.pipe(
            Effect.tap((response) =>
              Effect.gen(function* () {
                yield* Effect.log(
                  `<- res ${response.status} ${response.request.method} ${response.request.url}`,
                );
                // Log response body for non-2xx status codes
                if (response.status < 200 || response.status >= 300) {
                  const body = yield* response.text.pipe(Effect.result);
                  if (body._tag === 'Success') {
                    yield* Effect.logError('Error response body:', body.success);
                  }
                }
              }),
            ),
          ),
        ),
        HttpClient.tapError((error) =>
          Effect.gen(function* () {
            const request = error.request;
            yield* Effect.logError(`✗ res ${request.method} ${request.url}`, error);
          }),
        ),
        HttpClient.filterStatusOk,
      );

      const fetchToken = Effect.fn('EGWAuth.fetchToken')(function* () {
        // When using Basic Auth, don't include client_id and client_secret in body
        const token = yield* httpClient
          .post('/connect/token', {
            body: HttpBody.urlParams(
              UrlParams.fromInput({
                grant_type: 'client_credentials',
                scope: scope,
              }),
            ),
          })
          .pipe(
            Effect.flatMap(HttpClientResponse.schemaBodyJson(OAuthTokenResponse)),
            Effect.flatMap(decodeOAuthToAccessToken),
          );

        yield* writeTokenToCache(token);

        return token;
      }, Effect.orDie);

      const refreshToken = Effect.fn('EGWAuth.refreshToken')(function* (token: AccessToken) {
        if (!token.refreshToken) {
          return yield* EGWAuthError.make({
            message: 'No refresh token available',
          });
        }

        yield* Effect.logDebug('Refreshing EGW access token');

        const refreshedToken = yield* httpClient
          .post('/connect/token', {
            body: HttpBody.urlParams(
              UrlParams.fromInput({
                grant_type: 'refresh_token',
                refresh_token: Redacted.value(token.refreshToken),
              }),
            ),
          })
          .pipe(
            Effect.flatMap(HttpClientResponse.schemaBodyJson(OAuthTokenResponse)),
            Effect.flatMap(decodeOAuthToAccessToken),
            Effect.map((response) => {
              let refreshToken = token.refreshToken;
              if (Predicate.isNotUndefined(response.refreshToken)) {
                refreshToken = response.refreshToken;
              }
              return AccessToken.make({
                accessToken: response.accessToken,
                refreshToken,
                expiresAt: response.expiresAt,
                scope: response.scope,
              });
            }),
          );

        yield* writeTokenToCache(refreshedToken);

        return refreshedToken;
      }, Effect.orDie);

      const refreshTokenIfExpired = Effect.fn('EGWAuth.refreshTokenIfExpired')(function* (
        token: AccessToken,
      ) {
        const now = yield* Clock.currentTimeMillis;
        // Refresh if expired or expiring within 5 minutes
        const fiveMinutes = Duration.minutes(5);
        if (!token.isExpired(now - Duration.toMillis(fiveMinutes))) {
          return token;
        }
        // Token is expired - try to refresh, or fetch new if no refresh token
        if (token.refreshToken) {
          return yield* refreshToken(token);
        }
        // No refresh token (e.g., client_credentials grant) - fetch new token
        yield* Effect.logDebug('Token expired, fetching new token (no refresh token available)');
        return yield* fetchToken();
      });

      const initialToken = yield* readTokenFromCache().pipe(
        Effect.flatMap((maybeToken) =>
          Option.match(maybeToken, {
            onNone: () => fetchToken(),
            onSome: refreshTokenIfExpired,
          }),
        ),
      );

      const tokenRef = yield* SynchronizedRef.make(initialToken);

      const getToken = SynchronizedRef.updateAndGetEffect(tokenRef, refreshTokenIfExpired).pipe(
        Effect.withSpan('EGWAuth.getToken'),
      );

      // Periodically refresh token
      yield* getToken.pipe(
        Effect.interruptible,
        Effect.repeat({ schedule: Schedule.cron('0 0 * * *') }),
        Effect.forkChild,
      );

      return {
        getToken,
      };
    }),
  );

  /**
   * Convenience layer that bundles `Live` with a filesystem-backed
   * `EGWTokenStore`. Use this in Node-hosted contexts (CLI, sync workers, dev
   * scripts) where the token file lives on disk. The renderer should compose
   * `Live` with its own `EGWTokenStore.layerFromJsonPort` instead.
   *
   * Pass `tokenFile` to override the default `data/tokens.json` path
   * (otherwise reads `EGW_TOKEN_FILE` from env, with `data/tokens.json` as the
   * fallback).
   */
  static layerLiveFs = (
    tokenFile?: string,
  ): Layer.Layer<
    EGWAuth,
    | Config.ConfigError
    | PlatformError
    | Schema.SchemaError
    | HttpClientError.HttpClientError
    | EGWAuthError,
    FileSystem.FileSystem | Path.Path | HttpClient.HttpClient
  > => {
    // Guard process access: this method is safe to *call* from any context,
    // but the previous eager `static Default = EGWAuth.layerLiveFs()` ran
    // this at module load and crashed renderers (no `process` global). The
    // static field was removed; this guard belts-and-suspenders any future
    // caller that imports from a browser context.
    const path = Option.fromNullishOr(tokenFile).pipe(
      Option.orElse(() => envVar('EGW_TOKEN_FILE')),
      Option.getOrElse(() => 'data/tokens.json'),
    );
    return Layer.provide(EGWAuth.Live, EGWTokenStore.layerFileSystem(path));
  };

  /**
   * Test implementation with a mock token.
   */
  static Test = (token?: AccessToken): Layer.Layer<EGWAuth> =>
    Layer.succeed(EGWAuth, {
      getToken: Effect.gen(function* () {
        if (Predicate.isNotUndefined(token)) return token;
        const now = yield* Clock.currentTimeMillis;
        return AccessToken.make({
          accessToken: Redacted.make('test-token'),
          expiresAt: now + 3600000,
          scope: 'test',
        });
      }),
    });
}
