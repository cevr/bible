// AWS Signature Version 4 for the S3 API, as R2 takes it: the request's
// canonical form hashed, signed with a key derived from the secret, and sent
// as `Authorization`. HMAC-SHA256 is built on Effect's `Crypto.digest`
// (RFC 2104), so signing needs no host crypto and no SDK. Checked against the
// signatures AWS publishes for its S3 examples (`sigv4.test.ts`).

import { type Crypto, DateTime, Effect, Order, Redacted } from 'effect';
import { Hex } from 'effect/encoding';
import type { PlatformError } from 'effect/PlatformError';

/** An S3 key pair. The secret stays `Redacted` until the signing key is derived. */
export interface S3Credentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: Redacted.Redacted<string>;
}

/** One request to sign: its method, its path and query as sent, and the headers to sign. */
export interface S3Request {
  readonly method: string;
  readonly host: string;
  /** The path, each segment already encoded (`encodeKey`). */
  readonly path: string;
  /** The query parameters, unencoded; signed in sorted order. */
  readonly query: ReadonlyArray<readonly [string, string]>;
  /** Headers to sign beside `host`, `x-amz-date` and `x-amz-content-sha256`. */
  readonly headers: Readonly<Record<string, string>>;
  /** The payload's sha256, hex. */
  readonly payloadHash: string;
}

/** The sha256 of no bytes: a GET's, a HEAD's, a list's payload hash. */
export const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const BLOCK = 64;
const text = new TextEncoder();

/** RFC 3986 percent-encoding as SigV4 wants it: everything but `A-Z a-z 0-9 - _ . ~` (and `/` when `slash`). */
export const uriEncode = (value: string, slash: boolean): string =>
  Array.from(text.encode(value), (byte) => {
    const char = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-_.~]/.test(char)) return char;
    if (slash && char === '/') return char;
    return `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }).join('');

/** A store key as a URL path under the bucket: each segment encoded, `/` kept. */
export const encodeKey = (key: string): string => uriEncode(key, true);

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

/** HMAC-SHA256 (RFC 2104) over `Crypto.digest`. */
export const hmacSha256 = Effect.fnUntraced(function* (
  crypto: Crypto.Crypto,
  key: Uint8Array,
  message: Uint8Array,
) {
  let block = key;
  if (block.length > BLOCK) block = yield* crypto.digest('SHA-256', block);
  const padded = new Uint8Array(BLOCK);
  padded.set(block);
  const inner = padded.map((b) => b ^ 0x36);
  const outer = padded.map((b) => b ^ 0x5c);
  const innerHash = yield* crypto.digest('SHA-256', concat(inner, message));
  return yield* crypto.digest('SHA-256', concat(outer, innerHash));
});

/** A digest of `bytes` as lowercase hex. */
export const sha256Hex = (
  crypto: Crypto.Crypto,
  bytes: Uint8Array,
): Effect.Effect<string, PlatformError> => Effect.map(crypto.digest('SHA-256', bytes), Hex.encode);

/** `20130524T000000Z`: the moment as SigV4 stamps it. */
export const amzDate = (at: DateTime.Utc): string =>
  DateTime.formatIso(at)
    .replace(/\.\d+Z$/, 'Z')
    .replaceAll(/[-:]/g, '');

/** The canonical request, the string to sign's last line hashed from it (exported for the tests). */
export const canonicalRequest = (request: S3Request, stamp: string): string => {
  const headers = Object.entries({
    ...Object.fromEntries(
      Object.entries(request.headers).map(([k, v]) => [k.toLowerCase(), v.trim()]),
    ),
    host: request.host,
    'x-amz-content-sha256': request.payloadHash,
    'x-amz-date': stamp,
  }).toSorted(Order.mapInput(Order.String, ([name]: readonly [string, string]) => name));
  const names = headers.map(([name]) => name);
  const query = request.query
    .map(([k, v]) => `${uriEncode(k, false)}=${uriEncode(v, false)}`)
    .toSorted()
    .join('&');
  return [
    request.method,
    request.path,
    query,
    ...headers.map(([name, value]) => `${name}:${value}`),
    '',
    names.join(';'),
    request.payloadHash,
  ].join('\n');
};

/** The headers that sign `request` at `at` for `region`: `x-amz-date`, `x-amz-content-sha256`, `authorization`. */
export const signS3 = Effect.fnUntraced(function* (
  crypto: Crypto.Crypto,
  credentials: S3Credentials,
  region: string,
  request: S3Request,
  at: DateTime.Utc,
) {
  const stamp = amzDate(at);
  const day = stamp.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const canonical = canonicalRequest(request, stamp);
  const toSign = [
    'AWS4-HMAC-SHA256',
    stamp,
    scope,
    yield* sha256Hex(crypto, text.encode(canonical)),
  ].join('\n');
  let key: Uint8Array = text.encode(`AWS4${Redacted.value(credentials.secretAccessKey)}`);
  for (const part of [day, region, 's3', 'aws4_request'])
    key = yield* hmacSha256(crypto, key, text.encode(part));
  const signature = Hex.encode(yield* hmacSha256(crypto, key, text.encode(toSign)));
  const signed = canonical.split('\n').at(-2) ?? '';
  return {
    'x-amz-date': stamp,
    'x-amz-content-sha256': request.payloadHash,
    authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`,
  };
});
