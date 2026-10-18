// Content digests, in one place: a file named by what it holds (a take, a
// library variant, a score), a store key's bytes checked against the hash
// they were kept under, the review's cache names, and a webhook's signature
// (an HMAC-SHA256, compared in constant time). Every sha256 here is
// lowercase hex, so the lock, the manifests and the store agree byte for byte.
// A file is hashed as it streams, never read whole.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Effect, type FileSystem, Stream } from 'effect';
import type { PlatformError } from 'effect/PlatformError';

/** The sha256 of `bytes`, as lowercase hex. */
export const sha256Hex = (bytes: Uint8Array | string): string =>
  createHash('sha256').update(bytes).digest('hex');

/** The HMAC-SHA256 of `text` under `key`. */
export const hmacSha256 = (key: Uint8Array, text: string): Uint8Array =>
  new Uint8Array(createHmac('sha256', key).update(text).digest());

/** Whether `a` and `b` are the same text, compared in time that does not depend on where they differ. */
export const sameText = (a: string, b: string): boolean => {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/** An incremental sha256: fed chunk by chunk as bytes stream past, read once at the end. */
interface Hashing {
  readonly update: (chunk: Uint8Array) => void;
  readonly hex: () => string;
}

/** A new incremental sha256. */
export const hashing = (): Hashing => {
  const hash = createHash('sha256');
  return { update: (chunk) => void hash.update(chunk), hex: () => hash.digest('hex') };
};

/** `stream`'s bytes passed on as they are, each chunk also fed to `into`. */
export const hashed = <E, R>(
  stream: Stream.Stream<Uint8Array, E, R>,
  into: Hashing,
): Stream.Stream<Uint8Array, E, R> =>
  Stream.tap(stream, (chunk) => Effect.sync(() => into.update(chunk)));

/** The sha256 of the file at `file`, read as a stream. */
export const sha256OfFile = (
  fs: FileSystem.FileSystem,
  file: string,
): Effect.Effect<string, PlatformError> =>
  Effect.suspend(() => {
    const into = hashing();
    return Stream.runDrain(hashed(fs.stream(file), into)).pipe(Effect.map(() => into.hex()));
  });

/** A cache file's name for what it is made from: 20 hex digits of the SHA-1 of `parts`. */
export const cacheKey = (parts: ReadonlyArray<string | number>): string =>
  createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 20);
