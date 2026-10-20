/**
 * The links in the list's emails carry a signed token, so the list stores
 * none: an HMAC-SHA-256 (WebCrypto, in Bun and on Workers alike) over the
 * token's purpose and its subscriber's id, under a key only the Worker holds
 * (`MAIL_TOKEN_KEY`, a Worker secret).
 *
 * - A confirm token also names when it was issued: it works for seven days
 *   (`CONFIRM_FOR`), and only while it is the newest one its subscriber was
 *   sent (the store checks that, `./list.ts`).
 * - An unsubscribe token never runs out: a link in an old email still works.
 *
 * The text is `c.<id>.<issued>.<signature>` or `u.<id>.<signature>`, the
 * signature in base64url, so it travels in a URL as it is.
 */
import { Context, Duration, Effect, Layer, Option, Redacted, Result } from 'effect';
import { Base64Url, Hex } from 'effect/encoding';

export type Token =
  | { readonly _tag: 'Confirm'; readonly subscriber: number; readonly issued: number }
  | { readonly _tag: 'Unsubscribe'; readonly subscriber: number };

/** How long a confirm link works after it is sent. */
export const CONFIRM_FOR = Duration.days(7);

/** The shortest key the Worker takes: 32 bytes, as 64 hex digits. */
const MIN_KEY_BYTES = 32;

/** Signed with every token, so a signature made for anything else never reads as one. */
const CONTEXT = 'firsttheblade-mail-v1';

export interface TokensService {
  readonly sign: (token: Token) => Effect.Effect<string>;
  /** The token a text carries, when its signature is good; none for anything else. */
  readonly read: (text: string) => Effect.Effect<Option.Option<Token>>;
}

export class Tokens extends Context.Service<Tokens, TokensService>()('firsttheblade/Tokens') {}

const payloadOf = (token: Token) => {
  if (token._tag === 'Confirm') return `c.${token.subscriber}.${token.issued}`;
  return `u.${token.subscriber}`;
};

const ID = /^[1-9][0-9]{0,14}$/;
const TIME = /^[0-9]{1,16}$/;

/** The token a payload names, when it names one. */
const tokenOf = (payload: string): Option.Option<Token> => {
  const [purpose, id = '', issued = '', ...rest] = payload.split('.');
  if (rest.length > 0 || !ID.test(id)) return Option.none();
  if (purpose === 'u' && issued === '') {
    return Option.some({ _tag: 'Unsubscribe', subscriber: Number(id) });
  }
  if (purpose === 'c' && TIME.test(issued)) {
    return Option.some({ _tag: 'Confirm', subscriber: Number(id), issued: Number(issued) });
  }
  return Option.none();
};

const bytes = (text: string) => new TextEncoder().encode(`${CONTEXT}:${text}`);

/** The key, from its hex text; a Worker given a short or malformed one cannot start. */
const importKey = (key: Redacted.Redacted<string>) =>
  Effect.gen(function* () {
    const raw = Hex.decode(Redacted.value(key).trim());
    if (Result.isFailure(raw) || raw.success.length < MIN_KEY_BYTES) {
      return yield* Effect.die(
        new Error(`MAIL_TOKEN_KEY must be at least ${MIN_KEY_BYTES} bytes as hex`),
      );
    }
    const material = new Uint8Array(raw.success);
    return yield* Effect.promise(() =>
      crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, [
        'sign',
        'verify',
      ]),
    );
  });

export const layer = (key: Redacted.Redacted<string>) =>
  Layer.effect(
    Tokens,
    Effect.gen(function* () {
      const cryptoKey = yield* importKey(key);
      const sign = Effect.fn('Tokens.sign')(function* (token: Token) {
        const payload = payloadOf(token);
        const signature = yield* Effect.promise(() =>
          crypto.subtle.sign('HMAC', cryptoKey, bytes(payload)),
        );
        return `${payload}.${Base64Url.encode(new Uint8Array(signature))}`;
      });
      const read = Effect.fn('Tokens.read')(function* (text: string) {
        const cut = text.lastIndexOf('.');
        const payload = text.slice(0, cut);
        const token = tokenOf(payload);
        const signature = Base64Url.decode(text.slice(cut + 1));
        if (cut < 0 || Option.isNone(token) || Result.isFailure(signature)) return Option.none();
        const signed = new Uint8Array(signature.success);
        const good = yield* Effect.promise(() =>
          crypto.subtle.verify('HMAC', cryptoKey, signed, bytes(payload)),
        );
        if (!good) return Option.none();
        return token;
      });
      return Tokens.of({ sign, read });
    }),
  );
