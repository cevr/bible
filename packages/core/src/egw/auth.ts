// @effect-diagnostics strictBooleanExpressions:off
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
import {
  Clock,
  Config,
  ServiceMap,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Redacted,
  Schedule,
  Schema,
  SynchronizedRef,
} from 'effect';

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

/**
 * Access Token with creation timestamp
 */
export class AccessToken extends Schema.Class<AccessToken>('lib/EGW/Auth/AccessToken')({
  accessToken: Schema.Redacted(Schema.NonEmptyString),
  refreshToken: Schema.optional(Schema.Redacted(Schema.NonEmptyString)),
  expiresAt: Schema.Int,
  scope: Schema.String,
}) {
  static fromJson = Schema.decodeEffect(Schema.fromJsonString(this));
  static toJson = Schema.encodeEffect(Schema.fromJsonString(this));

  isExpired(now: number): boolean {
    return this.expiresAt <= now;
  }
}

/**
 * Transform OAuth token response to AccessToken
 */
const decodeOAuthToAccessToken = (
  encoded: typeof OAuthTokenResponse.Type,
): Effect.Effect<AccessToken> =>
  Effect.gen(function* () {
    const createdAt = yield* Clock.currentTimeMillis;
    const expiresIn = encoded.expires_in * 1000;
    return new AccessToken({
      accessToken: Redacted.make(encoded.access_token),
      refreshToken: encoded.refresh_token ? Redacted.make(encoded.refresh_token) : undefined,
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
export class EGWAuth extends ServiceMap.Service<EGWAuth, EGWAuthService>()(
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
    FileSystem.FileSystem | Path.Path | HttpClient.HttpClient
  > = Layer.effect(
    EGWAuth,
    Effect.gen(function* () {
      // Defaults read process.env.X dot-syntax — Bun's `define` substitutes
      // these to literal strings at compile time, so the binary carries the
      // EGW credentials without needing the runtime to find a .env file.
      const authBaseUrl = yield* Config.string('EGW_AUTH_BASE_URL').pipe(
        Config.withDefault(process.env.EGW_AUTH_BASE_URL ?? 'https://cpanel.egwwritings.org'),
      );
      const clientId = yield* Config.string('EGW_CLIENT_ID').pipe(
        Config.withDefault(process.env.EGW_CLIENT_ID ?? ''),
      );
      const clientSecret = yield* Config.redacted('EGW_CLIENT_SECRET').pipe(
        Config.withDefault(Redacted.make(process.env.EGW_CLIENT_SECRET ?? '')),
      );
      const scope = yield* Config.string('EGW_SCOPE').pipe(
        Config.withDefault(
          process.env.EGW_SCOPE ?? 'writings search studycenter subscriptions user_info',
        ),
      );
      const tokenFile = yield* Config.string('EGW_TOKEN_FILE').pipe(
        Config.withDefault(process.env.EGW_TOKEN_FILE ?? 'data/tokens.json'),
      );

      if (!clientId || !Redacted.value(clientSecret)) {
        return yield* new EGWAuthError({
          message:
            'EGW_CLIENT_ID and EGW_CLIENT_SECRET must be set (check packages/cli/.env or env)',
          cause: undefined,
        });
      }

      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const tokenFilePath = path.resolve(tokenFile);

      // Ensure directory exists
      yield* fs.makeDirectory(path.dirname(tokenFilePath), { recursive: true }).pipe(Effect.orDie);

      // The on-disk persisted shape — plain strings for the secrets so
      // they round-trip through JSON. We re-wrap them as Redacted on read.
      const PersistedToken = Schema.Struct({
        accessToken: Schema.NonEmptyString,
        refreshToken: Schema.optional(Schema.NonEmptyString),
        expiresAt: Schema.Int,
        scope: Schema.String,
      });

      const readTokenFromCache = Effect.fn('EGWAuth.readTokenFromCache')(function* () {
        const exists = yield* fs.exists(tokenFilePath);
        if (!exists) {
          return yield* Effect.succeed(Option.none());
        }
        const json = yield* fs.readFileString(tokenFilePath, 'utf-8');
        const parsed = yield* Schema.decodeEffect(Schema.fromJsonString(PersistedToken))(json);
        const token = new AccessToken({
          accessToken: Redacted.make(parsed.accessToken),
          refreshToken:
            parsed.refreshToken !== undefined ? Redacted.make(parsed.refreshToken) : undefined,
          expiresAt: parsed.expiresAt,
          scope: parsed.scope,
        });
        return yield* Effect.succeed(Option.some(token));
      });

      const writeTokenToCache = Effect.fn('EGWAuth.writeTokenToCache')(function* (
        token: AccessToken,
      ) {
        const persisted = {
          accessToken: Redacted.value(token.accessToken),
          refreshToken:
            token.refreshToken !== undefined ? Redacted.value(token.refreshToken) : undefined,
          expiresAt: token.expiresAt,
          scope: token.scope,
        };
        yield* fs.writeFileString(tokenFilePath, JSON.stringify(persisted));
      });

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
            try {
              const json = JSON.parse(text);
              // Mask sensitive fields
              const maskedJson = {
                ...json,
                client_secret: json.client_secret ? '[REDACTED]' : undefined,
                refresh_token: json.refresh_token ? '[REDACTED]' : undefined,
              };
              return Effect.log(
                `-> req ${request.method} ${request.url}`,
                JSON.stringify(maskedJson),
              );
            } catch {
              return Effect.log(`-> req ${request.method} ${request.url}`);
            }
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
            const request = 'request' in error ? error.request : undefined;
            yield* Effect.logError(`✗ res ${request?.method} ${request?.url}`, String(error));
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
            Effect.map(
              (response) =>
                new AccessToken({
                  accessToken: response.accessToken,
                  refreshToken: Predicate.isNotUndefined(response.refreshToken)
                    ? response.refreshToken
                    : token.refreshToken,
                  expiresAt: response.expiresAt,
                  scope: response.scope,
                }),
            ),
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
          maybeToken._tag === 'Some' ? refreshTokenIfExpired(maybeToken.value) : fetchToken(),
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
   * Default layer - alias for Live (backwards compatibility).
   */
  static Default = EGWAuth.Live;

  /**
   * Test implementation with a mock token.
   */
  static Test = (token?: AccessToken): Layer.Layer<EGWAuth> =>
    Layer.succeed(EGWAuth, {
      getToken: () =>
        Effect.succeed(
          token ??
            new AccessToken({
              accessToken: Redacted.make('test-token'),
              expiresAt: Date.now() + 3600000,
              scope: 'test',
            }),
        ),
    });
}
