// The private store as a Cloudflare R2 bucket, over R2's S3 API: each request
// signed with SigV4 (`sigv4.ts`) and sent through Effect's HttpClient, so no
// SDK. The bucket is private (no r2.dev URL, no public domain): every read is
// signed with the bucket-scoped key the `film-store` stack mints
// (`apps/animations/infra/`).
//
// A `put` is one PutObject: R2 replaces an object whole, so a reader never
// sees half of it. Its payload hash is signed, so R2 refuses bytes that are
// not the ones hashed, and the same sha256 rides along as the object's
// metadata (`x-amz-meta-sha256`), so `hashOf` is a HEAD, never a download.
// A `get` checks the bytes it fetched against that hash before it renames
// them into place.

import {
  type Crypto,
  DateTime,
  Effect,
  type FileSystem,
  Option,
  type Path,
  Redacted,
  Schedule,
  Stream,
} from 'effect';
import {
  type HttpClient,
  HttpClient as Client,
  HttpClientRequest,
  type HttpClientResponse,
} from 'effect/http';
import type { R2StoreConfig } from '../core/sfx.ts';
import { StoreFailed } from './errors.ts';
import {
  type ByteRange,
  type MediaStoreService,
  type StoredObject,
  type StoredRead,
  clampRange,
} from './media-store.ts';
import {
  EMPTY_SHA256,
  type S3Credentials,
  encodeKey,
  sha256Hex,
  signS3,
  uriEncode,
} from './sigv4.ts';

/** What reaches the bucket: the account it is in and a key scoped to it (from the environment). */
export interface R2Access {
  readonly accountId: Redacted.Redacted<string>;
  readonly credentials: S3Credentials;
}

/** What the R2 store runs on. */
export interface R2Platform {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly crypto: Crypto.Crypto;
  readonly http: HttpClient.HttpClient;
}

/** R2 signs every request for the region `auto`. */
const REGION = 'auto';

/** The S3 endpoint's host for the account, in the bucket's jurisdiction. */
export const r2Host = (accountId: string, jurisdiction: R2StoreConfig['jurisdiction']): string => {
  if (jurisdiction === 'eu' || jurisdiction === 'fedramp')
    return `${accountId}.${jurisdiction}.r2.cloudflarestorage.com`;
  return `${accountId}.r2.cloudflarestorage.com`;
};

/** The metadata header that carries an object's sha256. */
const HASH_HEADER = 'x-amz-meta-sha256';

const TYPES = new Map([
  ['flac', 'audio/flac'],
  ['mp3', 'audio/mpeg'],
  ['wav', 'audio/wav'],
  ['m4a', 'audio/mp4'],
  ['mp4', 'video/mp4'],
  ['webm', 'video/webm'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['json', 'application/json'],
  ['vtt', 'text/vtt'],
  ['txt', 'text/plain'],
]);

/** A file's media type by its extension, else bytes. */
export const contentTypeOf = (key: string): string =>
  TYPES.get(key.split('.').at(-1)?.toLowerCase() ?? '') ?? 'application/octet-stream';

const XML_ENTITIES = new Map([
  ['&amp;', '&'],
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&apos;', "'"],
]);

/** The text of the first `<tag>` in `xml`, entities decoded. */
const xmlText = (xml: string, tag: string): Option.Option<string> =>
  Option.map(
    Option.fromNullishOr(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml)?.[1]),
    (text) =>
      text.replaceAll(/&(amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES.get(entity) ?? entity),
  );

/** One page of a ListObjectsV2 answer: its objects, and the token for the next page when it was cut. */
export interface ListPage {
  readonly objects: ReadonlyArray<StoredObject>;
  readonly next: Option.Option<string>;
}

/** The page a ListObjectsV2 answer holds. */
export const listPage = (xml: string): ListPage => {
  const objects = Array.from(xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g), (match) => {
    const block = match[1] ?? '';
    const object: StoredObject = {
      key: Option.getOrElse(xmlText(block, 'Key'), () => ''),
      size: Number(Option.getOrElse(xmlText(block, 'Size'), () => '0')),
      modified: Option.getOrElse(xmlText(block, 'LastModified'), () => ''),
    };
    return object;
  });
  const truncated = Option.contains(xmlText(xml, 'IsTruncated'), 'true');
  const next = Option.filter(xmlText(xml, 'NextContinuationToken'), () => truncated);
  return { objects, next };
};

/** `bytes 0-9/100` → start, end and the object's whole size. */
const contentRange = (header: string): Option.Option<StoredReadSpan> =>
  Option.map(Option.fromNullishOr(/^bytes (\d+)-(\d+)\/(\d+)$/.exec(header.trim())), (match) => ({
    start: Number(match[1]),
    end: Number(match[2]),
    size: Number(match[3]),
  }));

type StoredReadSpan = Pick<StoredRead, 'start' | 'end' | 'size'>;

/** One request to the bucket, before it is signed. */
interface Call {
  readonly op: string;
  readonly key: string;
  readonly method: 'GET' | 'HEAD' | 'PUT';
  /** The object's key, or none for the bucket itself (a list). */
  readonly object: Option.Option<string>;
  readonly query: ReadonlyArray<readonly [string, string]>;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Option.Option<{ readonly bytes: Uint8Array; readonly sha256: string }>;
}

/** A private R2 bucket as the store. */
export const r2Store = (
  platform: R2Platform,
  config: R2StoreConfig,
  access: R2Access,
): MediaStoreService => {
  const { fs, crypto } = platform;
  const host = r2Host(Redacted.value(access.accountId), config.jurisdiction);
  const where = `r2://${config.bucket}`;
  // Every request is idempotent (a PUT sends the same whole object again), so
  // transient failures are retried, a few times, backing off.
  const http = platform.http.pipe(
    Client.retryTransient({
      times: 3,
      schedule: Schedule.exponential('200 millis').pipe(Schedule.jittered),
    }),
  );
  const failed = (op: string, key: string, reason: string) =>
    StoreFailed.make({ store: where, op, key, reason });

  const send = Effect.fnUntraced(function* (call: Call) {
    const path = Option.match(call.object, {
      onNone: () => `/${config.bucket}`,
      onSome: (key) => `/${config.bucket}/${encodeKey(key)}`,
    });
    const payloadHash = Option.match(call.body, {
      onNone: () => EMPTY_SHA256,
      onSome: (body) => body.sha256,
    });
    const signed = yield* signS3(
      crypto,
      access.credentials,
      REGION,
      { method: call.method, host, path, query: call.query, headers: call.headers, payloadHash },
      yield* DateTime.now,
    ).pipe(Effect.mapError((error) => failed(call.op, call.key, error.message)));
    const query = call.query
      .map(([k, v]) => `${uriEncode(k, false)}=${uriEncode(v, false)}`)
      .toSorted()
      .join('&');
    let url = `https://${host}${path}`;
    if (query !== '') url = `${url}?${query}`;
    let request = HttpClientRequest.make(call.method)(url).pipe(
      HttpClientRequest.setHeaders({ ...call.headers, ...signed }),
    );
    if (Option.isSome(call.body))
      request = HttpClientRequest.bodyUint8Array(
        request,
        call.body.value.bytes,
        contentTypeOf(call.key),
      );
    return yield* http
      .execute(request)
      .pipe(Effect.mapError((error) => failed(call.op, call.key, error.message)));
  });

  /** An answer that is not one of `ok`: its status and S3 error code, as a failure. */
  const refused = Effect.fnUntraced(function* (
    call: Pick<Call, 'op' | 'key'>,
    response: HttpClientResponse.HttpClientResponse,
  ) {
    const body = yield* response.text.pipe(Effect.orElseSucceed(() => ''));
    const code = Option.getOrElse(xmlText(body, 'Code'), () => 'no error code');
    return yield* failed(call.op, call.key, `R2 answered ${response.status} (${code})`);
  });

  const object = (op: string, key: string, method: Call['method']): Call => ({
    op,
    key,
    method,
    object: Option.some(key),
    query: [],
    headers: {},
    body: Option.none(),
  });

  const hashOf = Effect.fn('R2Store.hashOf')(function* (key: string) {
    const response = yield* send(object('hash', key, 'HEAD'));
    if (response.status === 404) return Option.none<string>();
    if (response.status !== 200) return yield* refused({ op: 'hash', key }, response);
    return Option.fromUndefinedOr(response.headers[HASH_HEADER]);
  });

  const put = Effect.fn('R2Store.put')(function* (key: string, from: string) {
    const bytes = yield* fs
      .readFile(from)
      .pipe(Effect.mapError((error) => failed('put', key, error.message)));
    const sha256 = yield* sha256Hex(crypto, bytes).pipe(
      Effect.mapError((error) => failed('put', key, error.message)),
    );
    const call: Call = {
      ...object('put', key, 'PUT'),
      headers: { [HASH_HEADER]: sha256 },
      body: Option.some({ bytes, sha256 }),
    };
    const response = yield* send(call);
    if (response.status !== 200) return yield* refused(call, response);
    yield* Effect.logDebug(`store.put store=${where} key=${key} bytes=${bytes.length}`);
  });

  const get = Effect.fn('R2Store.get')(function* (key: string, to: string) {
    const call = object('get', key, 'GET');
    const response = yield* send(call);
    if (response.status !== 200) return yield* refused(call, response);
    const bytes = new Uint8Array(
      yield* response.arrayBuffer.pipe(
        Effect.mapError((error) => failed('get', key, error.message)),
      ),
    );
    const sha256 = yield* sha256Hex(crypto, bytes).pipe(
      Effect.mapError((error) => failed('get', key, error.message)),
    );
    const stored = Option.fromUndefinedOr(response.headers[HASH_HEADER]);
    if (Option.isSome(stored) && stored.value !== sha256)
      return yield* failed(
        'get',
        key,
        `the bytes fetched are not the sha256 they were stored under`,
      );
    const partial = `${to}.partial`;
    yield* Effect.gen(function* () {
      yield* fs.makeDirectory(platform.path.dirname(to), { recursive: true });
      yield* fs.writeFile(partial, bytes);
      yield* fs.rename(partial, to);
    }).pipe(Effect.mapError((error) => failed('get', key, error.message)));
  });

  const list = Effect.fn('R2Store.list')(function* (prefix: string) {
    const found: Array<StoredObject> = [];
    let token = Option.none<string>();
    do {
      const call: Call = {
        op: 'list',
        key: prefix,
        method: 'GET',
        object: Option.none(),
        query: [
          ['list-type', '2'],
          ['prefix', prefix],
          ...Option.match(token, {
            onNone: () => [],
            onSome: (t): ReadonlyArray<readonly [string, string]> => [['continuation-token', t]],
          }),
        ],
        headers: {},
        body: Option.none(),
      };
      const response = yield* send(call);
      if (response.status !== 200) return yield* refused(call, response);
      const page = listPage(
        yield* response.text.pipe(
          Effect.mapError((error) => failed('list', prefix, error.message)),
        ),
      );
      found.push(...page.objects);
      token = page.next;
    } while (Option.isSome(token));
    return found.toSorted((a, b) => a.key.localeCompare(b.key));
  });

  const read = Effect.fn('R2Store.read')(function* (key: string, range: Option.Option<ByteRange>) {
    const call: Call = {
      ...object('read', key, 'GET'),
      headers: Option.match(range, {
        onNone: () => ({}),
        onSome: ({ start, end }) => ({ range: `bytes=${start}-${end}` }),
      }),
    };
    const response = yield* send(call);
    if (response.status === 404) return Option.none<StoredRead>();
    if (response.status === 416) return yield* failed('read', key, 'the range starts past its end');
    if (response.status !== 200 && response.status !== 206) return yield* refused(call, response);
    // A range answers with its span and the whole size; a whole read with its length.
    const length = Number(response.headers['content-length'] ?? '0');
    const span = Option.match(Option.fromUndefinedOr(response.headers['content-range']), {
      onSome: contentRange,
      onNone: () =>
        Option.map(clampRange(Option.none(), length), (r): StoredReadSpan => ({
          ...r,
          size: length,
        })),
    });
    if (Option.isNone(span)) return yield* failed('read', key, 'R2 sent no range it could name');
    const stream = response.stream.pipe(
      Stream.mapError((error) => failed('read', key, error.message)),
    );
    return Option.some<StoredRead>({ ...span.value, stream });
  });

  return { where, hashOf, get, put, list, read };
};
