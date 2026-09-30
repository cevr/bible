// SigV4 against the signatures AWS publishes for its S3 examples
// ("Signature Calculations for the Authorization Header: Transferring Payload
// in a Single Chunk"), and HMAC-SHA256 against RFC 4231.

import { BunServices } from '@effect/platform-bun';
import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Crypto, DateTime, Effect, Encoding, Redacted } from 'effect';
import { EMPTY_SHA256, encodeKey, hmacSha256, signS3, type S3Request } from './sigv4.ts';

const credentials = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: Redacted.make('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'),
};
const at = DateTime.makeUnsafe('2013-05-24T00:00:00Z');
const host = 'examplebucket.s3.amazonaws.com';
const text = new TextEncoder();

const signatureOf = (request: S3Request) =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const headers = yield* signS3(crypto, credentials, 'us-east-1', request, at);
    return headers.authorization.split('Signature=')[1];
  });

describe('SigV4', () => {
  it.effect("signs AWS's GET Object example (a range)", () =>
    Effect.gen(function* () {
      const signature = yield* signatureOf({
        method: 'GET',
        host,
        path: '/test.txt',
        query: [],
        headers: { range: 'bytes=0-9' },
        payloadHash: EMPTY_SHA256,
      });
      expect(signature).toBe('f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect("signs AWS's PUT Object example (an encoded key, a signed payload)", () =>
    Effect.gen(function* () {
      const signature = yield* signatureOf({
        method: 'PUT',
        host,
        path: `/${encodeKey('test$file.text')}`,
        query: [],
        headers: {
          date: 'Fri, 24 May 2013 00:00:00 GMT',
          'x-amz-storage-class': 'REDUCED_REDUNDANCY',
        },
        payloadHash: '44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072',
      });
      expect(signature).toBe('98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd');
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect("signs AWS's list example (a sorted query)", () =>
    Effect.gen(function* () {
      const signature = yield* signatureOf({
        method: 'GET',
        host,
        path: '/',
        query: [
          ['prefix', 'J'],
          ['max-keys', '2'],
        ],
        headers: {},
        payloadHash: EMPTY_SHA256,
      });
      expect(signature).toBe('34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7');
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('computes HMAC-SHA256 as RFC 4231 does, a long key hashed first', () =>
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto;
      const short = yield* hmacSha256(
        crypto,
        text.encode('Jefe'),
        text.encode('what do ya want for nothing?'),
      );
      expect(Encoding.encodeHex(short)).toBe(
        '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
      );
      const long = yield* hmacSha256(
        crypto,
        new Uint8Array(131).fill(0xaa),
        text.encode('Test Using Larger Than Block-Size Key - Hash Key First'),
      );
      expect(Encoding.encodeHex(long)).toBe(
        '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54',
      );
    }).pipe(Effect.provide(BunServices.layer)),
  );

  test('encodes a key segment by segment, keeping its slashes', () => {
    expect(encodeKey('renders/rbf/c-robe 188.15.jpg')).toBe('renders/rbf/c-robe%20188.15.jpg');
    expect(encodeKey('scores/f/é+a.mp3')).toBe('scores/f/%C3%A9%2Ba.mp3');
  });
});
