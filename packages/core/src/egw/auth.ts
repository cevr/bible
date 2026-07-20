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
export class EGWAuthError extends Schema.TaggedErrorClass<EGWAuthError>()('EGWAuthError', {
  cause: Schema.Unknown,
  message: Schema.String,
}) {}

/**
 * OAuth Token Response from API
 */
const OAuthTokenResponse = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.optional(Schema.String),
  token_type: Schema.String,
  expires_in: Schema.Number,
  scope: Schema.String,
});

const RequestLogBody = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown));
const decodeRequestLogBody = Schema.decodeUnknownOption(RequestLogBody);
const encodeJson = Schema.encodeSync(Schema.UnknownFromJsonString);

/**
 * Transform OAuth token response to AccessToken
 */
const decodeOAuthToAccessToken = (
  encoded: typeof OAuthTokenResponse.Type,
): Effect.Effect<AccessToken> =>
  Effect.gen(function* () {
    const createdAt = yield* Clock.currentTimeMillis;
    const expiresIn = encoded.expires_in * 1000;
    let refreshToken: Redacted.Redacted | undefined;
    if (encoded.refresh_token !== undefined) refreshToken = Redacted.make(encoded.refresh_token);
    return new AccessToken({
      accessToken: Redacted.make(encoded.access_token),
      refreshToken,
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
  readonly getToken: () => Effect.Effect<AccessToken>;
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
          bakedAuthBaseUrl() ?? envVar('EGW_AUTH_BASE_URL') ?? 'https://cpanel.egwwritings.org',
        ),
      );
      const clientId = yield* Config.string('EGW_CLIENT_ID').pipe(
        Config.withDefault(bakedClientId() ?? envVar('EGW_CLIENT_ID') ?? ''),
      );
      const clientSecret = yield* Config.redacted('EGW_CLIENT_SECRET').pipe(
        Config.withDefault(Redacted.make(bakedClientSecret() ?? envVar('EGW_CLIENT_SECRET') ?? '')),
      );
      const scope = yield* Config.string('EGW_SCOPE').pipe(
        Config.withDefault(
          bakedScope() ??
            envVar('EGW_SCOPE') ??
            'writings search studycenter subscriptions user_info',
        ),
      );
      if (!clientId || !Redacted.value(clientSecret)) {
        return yield* new EGWAuthError({
          message:
            'EGW_CLIENT_ID and EGW_CLIENT_SECRET must be set (check packages/cli/.env or env)',
          cause: undefined,
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
              let clientSecret: string | undefined;
              if (json['client_secret']) clientSecret = '[REDACTED]';
              let refreshToken: string | undefined;
              if (json['refresh_token']) refreshToken = '[REDACTED]';
              const maskedJson = {
                ...json,
                client_secret: clientSecret,
                refresh_token: refreshToken,
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
            let request: HttpClientRequest.HttpClientRequest | undefined;
            if ('request' in error) request = error.request;
            yield* Effect.logError(`✗ res ${request?.method} ${request?.url}`, error);
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
          return yield* new EGWAuthError({
            message: 'No refresh token available',
            cause: undefined,
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
              return new AccessToken({
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

      const getToken = Effect.fn('EGWAuth.getToken')(() =>
        SynchronizedRef.updateAndGetEffect(tokenRef, refreshTokenIfExpired),
      );

      // Periodically refresh token
      yield* getToken().pipe(
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
    let path = tokenFile;
    if (path === undefined) path = envVar('EGW_TOKEN_FILE');
    if (path === undefined) path = 'data/tokens.json';
    return Layer.provide(EGWAuth.Live, EGWTokenStore.layerFileSystem(path));
  };

  /**
   * Test implementation with a mock token.
   */
  static Test = (token?: AccessToken): Layer.Layer<EGWAuth> =>
    Layer.succeed(EGWAuth, {
      getToken: () =>
        Effect.gen(function* () {
          if (token !== undefined) return token;
          const now = yield* Clock.currentTimeMillis;
          return new AccessToken({
            accessToken: Redacted.make('test-token'),
            expiresAt: now + 3600000,
            scope: 'test',
          });
        }),
    });
}
