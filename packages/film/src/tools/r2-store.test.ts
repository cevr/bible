// The private store's contract, held by both stores: the folder store on a
// temporary folder, and the R2 store against a fake S3 bucket in memory (an
// HttpClient that checks every request's SigV4 signature and payload hash as
// R2 would, and answers HEAD, GET with a range, PUT and ListObjectsV2). Then
// the store as an app declares it: an R2 bucket with its key from the
// environment, and the names of the variables missing when it is not set.
// Synthetic bytes only; nothing leaves the process.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import {
  ConfigProvider,
  Context,
  Crypto,
  DateTime,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Redacted,
  Stream,
} from 'effect';
import { HttpClient, type HttpClientRequest, HttpClientResponse } from 'effect/http';
import type { StoreFailed } from './errors.ts';
import { type MediaStoreService, folderStore } from './media-store.ts';
import { PrivateStore, R2_ENV } from './private-store.ts';
import { r2Store } from './r2-store.ts';
import { type S3Credentials, sha256Hex, signS3 } from './sigv4.ts';

const ACCOUNT = 'a1b2c3';
const BUCKET = 'film-store-test';
const credentials: S3Credentials = {
  accessKeyId: 'test-key-id',
  secretAccessKey: Redacted.make('test-secret'),
};

interface Held {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly sha256: string;
  readonly modified: string;
}

/** `20260930T120000Z` back to the moment it stamps. */
const fromAmzDate = (stamp: string) =>
  DateTime.makeUnsafe(
    `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`,
  );

const xml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;');

/**
 * A private bucket in memory, as R2's S3 API answers: a request whose
 * signature is not the bucket's key's (403 SignatureDoesNotMatch), or whose
 * body is not its signed hash (400 XAmzContentSHA256Mismatch), is refused.
 * Lists come two keys a page, so paging is exercised.
 */
/** What the fake bucket answers: a status, a body (empty for none), headers. */
interface Answer {
  readonly status: number;
  readonly body: Uint8Array<ArrayBuffer> | string;
  readonly headers: Readonly<Record<string, string>>;
}

const s3Error = (status: number, code: string): Answer => ({
  status,
  body: `<?xml version="1.0"?><Error><Code>${code}</Code></Error>`,
  headers: {},
});

/** Whether the request carries the signature the bucket's key gives it, recomputed from what was sent. */
const signedBy = (
  crypto: Crypto.Crypto,
  secret: S3Credentials,
  request: HttpClientRequest.HttpClientRequest,
  url: URL,
) =>
  Effect.gen(function* () {
    const headers = request.headers;
    const auth = headers['authorization'] ?? '';
    const own = new Set(['host', 'x-amz-date', 'x-amz-content-sha256']);
    const names = (/SignedHeaders=([^,]+)/.exec(auth)?.[1] ?? '').split(';');
    const resigned = yield* signS3(
      crypto,
      secret,
      'auto',
      {
        method: request.method,
        host: url.host,
        path: url.pathname,
        query: Array.from(url.searchParams.entries()),
        headers: Object.fromEntries(
          names.filter((n) => !own.has(n)).map((n) => [n, headers[n] ?? '']),
        ),
        payloadHash: headers['x-amz-content-sha256'] ?? '',
      },
      fromAmzDate(headers['x-amz-date'] ?? ''),
    );
    return resigned.authorization === auth && url.host === `${ACCOUNT}.r2.cloudflarestorage.com`;
  });

/** ListObjectsV2, two keys a page. */
const listAnswer = (objects: Map<string, Held>, url: URL): Answer => {
  const prefix = url.searchParams.get('prefix') ?? '';
  const after = url.searchParams.get('continuation-token') ?? '';
  const keys = [...objects.keys()].filter((k) => k.startsWith(prefix) && k > after).toSorted();
  const page = keys.slice(0, 2);
  const contents = page
    .map((k) => {
      const held = objects.get(k);
      return `<Contents><Key>${xml(k)}</Key><LastModified>${held?.modified}</LastModified><Size>${held?.bytes.length}</Size></Contents>`;
    })
    .join('');
  let next = '';
  if (keys.length > 2)
    next = `<NextContinuationToken>${xml(page.at(-1) ?? '')}</NextContinuationToken>`;
  return {
    status: 200,
    body: `<ListBucketResult><IsTruncated>${keys.length > 2}</IsTruncated>${contents}${next}</ListBucketResult>`,
    headers: {},
  };
};

/** HEAD or GET (whole, or a range) of one object. */
const objectAnswer = (held: Held, method: string, range: string): Answer => {
  const meta = { 'x-amz-meta-sha256': held.sha256 };
  if (method === 'HEAD') return { status: 200, body: '', headers: meta };
  const size = held.bytes.length;
  return Option.match(Option.fromNullishOr(/^bytes=(\d+)-(\d+)$/.exec(range)), {
    onNone: () => ({
      status: 200,
      body: held.bytes.slice(),
      headers: { ...meta, 'content-length': `${size}` },
    }),
    onSome: (match): Answer => {
      const start = Number(match[1]);
      if (start >= size) return s3Error(416, 'InvalidRange');
      const end = Math.min(Number(match[2]), size - 1);
      return {
        status: 206,
        body: held.bytes.slice(start, end + 1),
        headers: { ...meta, 'content-range': `bytes ${start}-${end}/${size}` },
      };
    },
  });
};

/** The bucket's answer to a request already signed and hashed as it should be. */
const bucketAnswer = (
  objects: Map<string, Held>,
  request: HttpClientRequest.HttpClientRequest,
  url: URL,
  body: Uint8Array,
): Answer => {
  const [, bucket, ...rest] = url.pathname.split('/');
  if (bucket !== BUCKET) return s3Error(404, 'NoSuchBucket');
  const key = decodeURIComponent(rest.join('/'));
  if (key === '' && request.method === 'GET') return listAnswer(objects, url);
  if (request.method === 'PUT') {
    objects.set(key, {
      bytes: body.slice(),
      sha256: request.headers['x-amz-meta-sha256'] ?? '',
      modified: '2026-09-30T12:00:00.000Z',
    });
    return { status: 200, body: '', headers: {} };
  }
  return Option.match(Option.fromUndefinedOr(objects.get(key)), {
    onNone: () => s3Error(404, 'NoSuchKey'),
    onSome: (held) => objectAnswer(held, request.method, request.headers['range'] ?? ''),
  });
};

const fakeR2 = (objects: Map<string, Held>, secret: S3Credentials) =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    return HttpClient.make((request, url) =>
      Effect.gen(function* () {
        let body: Uint8Array = new Uint8Array();
        if (request.body._tag === 'Uint8Array') body = request.body.body;
        let answer: Answer;
        if (!(yield* signedBy(crypto, secret, request, url)))
          answer = s3Error(403, 'SignatureDoesNotMatch');
        else if ((yield* sha256Hex(crypto, body)) !== request.headers['x-amz-content-sha256'])
          answer = s3Error(400, 'XAmzContentSHA256Mismatch');
        else answer = bucketAnswer(objects, request, url, body);
        return HttpClientResponse.fromWeb(
          request,
          new Response(answer.body, { status: answer.status, headers: answer.headers }),
        );
      }).pipe(Effect.orDie),
    );
  });

/** Every byte a read streams, joined. */
const drain = (stream: Stream.Stream<Uint8Array, StoreFailed>) =>
  Effect.map(Stream.runCollect(stream), (chunks) => {
    const parts = Array.from(chunks);
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const part of parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  });

const text = new TextEncoder();

/** A store's whole contract, over synthetic files in `dir`. */
const contract = (store: MediaStoreService, dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const crypto = yield* Crypto.Crypto;
    const bytes = text.encode('synthetic render: 0123456789');
    const source = `${dir}/c-robe 188.15.mp4`;
    yield* fs.writeFile(source, bytes);
    const key = 'renders/rbf/c-robe 188.15.mp4';

    expect(yield* store.hashOf(key)).toEqual(Option.none());
    yield* store.put(key, source);
    expect(yield* store.hashOf(key)).toEqual(Option.some(yield* sha256Hex(crypto, bytes)));

    // Whole, into a folder that does not exist yet, and nothing half-written left.
    const back = `${dir}/back/again.mp4`;
    yield* store.get(key, back);
    expect(yield* fs.readFile(back)).toEqual(bytes);
    expect(yield* fs.exists(`${back}.partial`)).toBe(false);

    // A range, as a player asks for one, and the whole when none is given.
    const ranged = Option.getOrThrow(yield* store.read(key, Option.some({ start: 10, end: 17 })));
    expect({ size: ranged.size, start: ranged.start, end: ranged.end }).toEqual({
      size: bytes.length,
      start: 10,
      end: 17,
    });
    expect(new TextDecoder().decode(yield* drain(ranged.stream))).toBe('render: ');
    const whole = Option.getOrThrow(yield* store.read(key, Option.none()));
    expect(yield* drain(whole.stream)).toEqual(bytes);
    expect(yield* store.read('renders/none.mp4', Option.none())).toEqual(Option.none());
    const past = yield* Effect.flip(store.read(key, Option.some({ start: 999, end: 1000 })));
    expect(past._tag).toBe('StoreFailed');

    // Listed under its prefix, sorted, across pages.
    for (const name of ['a.jpg', 'b.jpg', 'c.jpg']) {
      yield* fs.writeFileString(`${dir}/${name}`, name);
      yield* store.put(`renders/sheets/${name}`, `${dir}/${name}`);
    }
    yield* fs.writeFileString(`${dir}/score.mp3`, 'score');
    yield* store.put('scores/f/score.mp3', `${dir}/score.mp3`);
    const listed = yield* store.list('renders/');
    expect(listed.map((o) => o.key)).toEqual([
      key,
      'renders/sheets/a.jpg',
      'renders/sheets/b.jpg',
      'renders/sheets/c.jpg',
    ]);
    expect(listed[0]?.size).toBe(bytes.length);
    expect((yield* store.list('scores/')).map((o) => o.key)).toEqual(['scores/f/score.mp3']);

    // A put of other bytes under the same key replaces them whole.
    yield* fs.writeFileString(source, 'the second cut');
    yield* store.put(key, source);
    yield* store.get(key, back);
    expect(yield* fs.readFileString(back)).toBe('the second cut');
  });

const tempDir = Effect.flatMap(FileSystem.FileSystem, (fs) => fs.makeTempDirectoryScoped());

/** Where an app that declares the R2 store lives, and the fake bucket's objects. */
class Declared extends Context.Service<
  Declared,
  { readonly dir: string; readonly objects: Map<string, Held> }
>()('test/Declared') {}

/** An app whose `library.ts` declares the R2 store, with `env` as its environment. */
const declared = (env: Record<string, string>) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(
        `${dir}/library.ts`,
        `export const library = {};\nexport const store = { kind: 'r2', bucket: '${BUCKET}' };\n`,
      );
      const objects = new Map<string, Held>();
      const http = yield* fakeR2(objects, credentials);
      return PrivateStore.layer(dir).pipe(
        Layer.provide([
          Layer.succeed(HttpClient.HttpClient, http),
          ConfigProvider.layer(ConfigProvider.fromUnknown({ HOME: dir, ...env })),
        ]),
        Layer.merge(Layer.succeed(Declared, Declared.of({ dir, objects }))),
      );
    }),
  ).pipe(Layer.provideMerge(BunServices.layer));

describe('the private store', () => {
  it.effect('a folder store keeps the contract', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const crypto = yield* Crypto.Crypto;
      const dir = yield* tempDir;
      const store = folderStore(fs, path, `${dir}/store`, (b) => sha256Hex(crypto, b));
      yield* contract(store, dir);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('an R2 store keeps the contract, every request signed with the bucket key', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const crypto = yield* Crypto.Crypto;
      const dir = yield* tempDir;
      const objects = new Map<string, Held>();
      const http = yield* fakeR2(objects, credentials);
      const store = r2Store(
        { fs, path, crypto, http },
        { kind: 'r2', bucket: BUCKET },
        { accountId: Redacted.make(ACCOUNT), credentials },
      );
      expect(store.where).toBe(`r2://${BUCKET}`);
      yield* contract(store, dir);
      // The hash rides with the object, so `hashOf` never downloads it.
      const held = objects.get('scores/f/score.mp3');
      expect(held?.sha256).toBe(yield* sha256Hex(crypto, text.encode('score')));
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('an R2 store names what R2 refused, and refuses bytes that are not their hash', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const crypto = yield* Crypto.Crypto;
      const dir = yield* tempDir;
      const objects = new Map<string, Held>();
      const http = yield* fakeR2(objects, credentials);
      const wrongKey = r2Store(
        { fs, path, crypto, http },
        { kind: 'r2', bucket: BUCKET },
        {
          accountId: Redacted.make(ACCOUNT),
          credentials: { ...credentials, secretAccessKey: Redacted.make('not the key') },
        },
      );
      yield* fs.writeFileString(`${dir}/x.flac`, 'x');
      const refused = yield* Effect.flip(wrongKey.put('files/x.flac', `${dir}/x.flac`));
      expect(refused.message).toContain('R2 answered 403 (SignatureDoesNotMatch)');
      expect(refused.message).not.toContain('not the key');

      // An object whose bytes are not the hash it carries is never written into place.
      objects.set('files/y.flac', {
        bytes: text.encode('half a fi'),
        sha256: yield* sha256Hex(crypto, text.encode('half a file')),
        modified: '',
      });
      const store = r2Store(
        { fs, path, crypto, http },
        { kind: 'r2', bucket: BUCKET },
        { accountId: Redacted.make(ACCOUNT), credentials },
      );
      const corrupt = yield* Effect.flip(store.get('files/y.flac', `${dir}/y.flac`));
      expect(corrupt.reason).toContain('not the sha256');
      expect(yield* fs.exists(`${dir}/y.flac`)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect("the declared R2 bucket is reached with the environment's key", () =>
    Effect.gen(function* () {
      const { dir, objects } = yield* Declared;
      const fs = yield* FileSystem.FileSystem;
      const store = yield* (yield* PrivateStore).store;
      expect(store.where).toBe(`r2://${BUCKET}`);
      yield* fs.writeFileString(`${dir}/z.flac`, 'z');
      yield* store.put('files/z.flac', `${dir}/z.flac`);
      expect([...objects.keys()]).toEqual(['files/z.flac']);
    }).pipe(
      Effect.provide(
        declared({
          [R2_ENV.accountId]: ACCOUNT,
          [R2_ENV.accessKeyId]: credentials.accessKeyId,
          [R2_ENV.secretAccessKey]: Redacted.value(credentials.secretAccessKey),
        }),
      ),
    ),
  );

  it.effect('the declared R2 bucket without its key names the variables missing', () =>
    Effect.gen(function* () {
      const missing = yield* Effect.flip((yield* PrivateStore).store);
      expect(missing._tag).toBe('StoreCredentialsMissing');
      expect(missing.message).toContain(`${R2_ENV.accessKeyId}, ${R2_ENV.secretAccessKey}`);
      expect(missing.message).toContain('bun run store:keys');
    }).pipe(Effect.provide(declared({ [R2_ENV.accountId]: ACCOUNT }))),
  );
});
