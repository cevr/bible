/**
 * The copy job's hashes on Bun: `Bun.CryptoHasher`, which hashes a buffer in
 * native code. Effect's `Crypto.digest` has no MD5, and git's blob id needs
 * its header hashed before the bytes.
 */
import { Layer } from 'effect';

import { Hash } from './stores.ts';

const hex = (algorithm: 'md5' | 'sha1', parts: ReadonlyArray<Uint8Array | string>) => {
  const hasher = new Bun.CryptoHasher(algorithm);
  for (const part of parts) hasher.update(part);
  return hasher.digest('hex');
};

export const HashBun = Layer.succeed(
  Hash,
  Hash.of({
    md5: (bytes) => hex('md5', [bytes]),
    gitBlobSha1: (bytes) => hex('sha1', [`blob ${bytes.byteLength}\0`, bytes]),
  }),
);
