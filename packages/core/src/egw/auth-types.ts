import { Redacted, Schema } from 'effect';

/**
 * Decoded OAuth access token. Lives in its own module so both `EGWAuth`
 * (which mints them) and `EGWTokenStore` (which persists them) can depend
 * on it without forming a cycle.
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

// Convenience for callers that want a plain object (e.g. for JSON persistence).
export const accessTokenToJson = (token: AccessToken) => ({
  accessToken: Redacted.value(token.accessToken),
  refreshToken: token.refreshToken !== undefined ? Redacted.value(token.refreshToken) : undefined,
  expiresAt: token.expiresAt,
  scope: token.scope,
});
