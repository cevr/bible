/**
 * The adapters' pure edges: how a HEAD's status reads, how the tree's paths
 * become hymns, and how each URL keeps its slashes. The network calls around
 * them are the copy's dry run (`bun run audio:copy --dry-run`).
 */
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option, Result } from 'effect';

import { rawUrl, recordings } from './github.ts';
import { etagMd5, unquote } from './plan.ts';
import { objectUrl } from './r2.ts';
import { headOf } from './s3.ts';

describe('S3 HEAD', () => {
  it.effect('reads 200 as present, with its size and ETag', () =>
    Effect.gen(function* () {
      const head = yield* headOf(1, 200, {
        'content-length': '2313865',
        etag: '"8a1f"',
        'content-type': 'audio/mpeg',
      });
      expect(head).toEqual(
        Option.some({ size: 2313865, etag: '"8a1f"', contentType: 'audio/mpeg' }),
      );
    }),
  );

  it.effect('reads 403 and 404 as absent: S3 refuses a key it lacks', () =>
    Effect.gen(function* () {
      expect(yield* headOf(388, 403, {})).toEqual(Option.none());
      expect(yield* headOf(388, 404, {})).toEqual(Option.none());
    }),
  );

  it.effect('fails any other status, so a 5xx or a 429 never reads as absent', () =>
    Effect.gen(function* () {
      for (const status of [500, 503, 429, 301]) {
        const result = yield* Effect.result(headOf(5, status, {}));
        expect(Result.isFailure(result)).toBe(true);
      }
    }),
  );

  it.effect('fails a 200 with no size or ETag', () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(headOf(5, 200, { etag: '"8a1f"' }));
      expect(Result.isFailure(result)).toBe(true);
    }),
  );
});

describe('ETags', () => {
  it.effect('a single-part ETag is its MD5; a multipart one has none', () =>
    Effect.sync(() => {
      expect(etagMd5('"B5AB87C109F83365304DC72CEEE4DB23"')).toEqual(
        Option.some('b5ab87c109f83365304dc72ceee4db23'),
      );
      expect(etagMd5('"9b2cf535f27731c974343645a3985328-2"')).toEqual(Option.none());
      expect(unquote('"abc"')).toBe('abc');
    }),
  );
});

describe('GitHub tree', () => {
  const blob = (path: string, size = 10) => ({ path, type: 'blob', sha: 'f'.repeat(40), size });

  it.effect('maps each recording to its hymn number, past the folder and the other files', () =>
    Effect.gen(function* () {
      const entries = yield* recordings({
        truncated: false,
        tree: [
          { path: 'mp3', type: 'tree', sha: 'a'.repeat(40) },
          blob('mp3/001 – Praise to the Lord.mp3'),
          blob('mp3/388 – Don’t Forget the Sabbath.mp3', 2991377),
          blob('scripts/upload-hymns.ts'),
          blob('README.md'),
        ],
      });
      expect([...entries.keys()]).toEqual([1, 388]);
      expect(entries.get(388)).toEqual({
        hymn: 388,
        path: 'mp3/388 – Don’t Forget the Sabbath.mp3',
        size: 2991377,
        sha: 'f'.repeat(40),
      });
    }),
  );

  it.effect('refuses a truncated tree and a hymn with two recordings', () =>
    Effect.gen(function* () {
      const truncated = yield* Effect.result(recordings({ truncated: true, tree: [] }));
      expect(Result.isFailure(truncated)).toBe(true);
      const twice = yield* Effect.result(
        recordings({ truncated: false, tree: [blob('mp3/005 – A.mp3'), blob('mp3/5 – B.mp3')] }),
      );
      expect(Result.isFailure(twice)).toBe(true);
    }),
  );

  it.effect('escapes each path segment of a raw download and keeps the slashes', () =>
    Effect.sync(() => {
      expect(rawUrl('mp3/388 – Don’t Forget the Sabbath, Lord.mp3')).toBe(
        'https://raw.githubusercontent.com/cevr/sda-hymns/4645e76cda1ed7eb8a95a6b59a1d29789406bbf8/mp3/388%20%E2%80%93%20Don%E2%80%99t%20Forget%20the%20Sabbath%2C%20Lord.mp3',
      );
    }),
  );
});

describe('R2 upload address', () => {
  it.effect('sends the key’s slashes literally, never as %2F', () =>
    Effect.sync(() => {
      expect(objectUrl('https://api.cloudflare.com/client/v4', 'acc', 'audio/sdah/1.mp3')).toBe(
        'https://api.cloudflare.com/client/v4/accounts/acc/r2/buckets/cvr-hymns/objects/audio/sdah/1.mp3',
      );
    }),
  );
});
