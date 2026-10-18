/**
 * The adapters through their layers, over a recording `HttpClient`: each test
 * scripts the answers, and reads back the requests the adapter sent. No call
 * leaves the process. Retries run on the test clock.
 */
import * as CloudflareCredentials from '@distilled.cloud/cloudflare/Credentials';
import * as Cloudflare from 'alchemy/Cloudflare';
import { describe, expect, it } from 'effect-bun-test';
import { Console, Effect, Fiber, Layer, Option, Redacted, Result } from 'effect';
import type { Duration } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/http';
import type { HttpClientRequest } from 'effect/http';
import { TestClock } from 'effect/testing';

import { FillGitHub } from './github.ts';
import { HashBun } from './hash-bun.ts';
import { run } from './job.ts';
import { etagMd5, unquote } from './plan.ts';
import { TargetR2 } from './r2.ts';
import { SourceS3 } from './s3.ts';
import type { TargetObject } from './stores.ts';
import { Fill, Hash, Source, Target } from './stores.ts';

interface Sent {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Option.Option<Uint8Array>;
}

/** An answer to the n-th request (0 first): a response, or none at all. */
type Script = (request: Sent, n: number) => Option.Option<Response>;

const bodyOf = (request: HttpClientRequest.HttpClientRequest): Option.Option<Uint8Array> => {
  if (request.body._tag === 'Uint8Array') return Option.some(request.body.body);
  return Option.none();
};

type Answer = () => Option.Option<Response>;

/** The answers in turn, the last one again for every request after it. */
const inTurn =
  (...answers: ReadonlyArray<Answer>): Script =>
  (_, n) =>
    Option.fromUndefinedOr(answers[Math.min(n, answers.length - 1)]).pipe(
      Option.flatMap((answer) => answer()),
    );

/** A client that keeps what it is sent and answers from the script. */
const recording = (script: Script) => {
  const sent: Array<Sent> = [];
  const client = HttpClient.make((request, url) => {
    const entry: Sent = {
      method: request.method,
      url: url.toString(),
      headers: request.headers,
      body: bodyOf(request),
    };
    const n = sent.length;
    sent.push(entry);
    return Option.match(script(entry, n), {
      onNone: () => Effect.never,
      onSome: (response) => Effect.succeed(HttpClientResponse.fromWeb(request, response)),
    });
  });
  return { sent, layer: Layer.succeed(HttpClient.HttpClient, client) };
};

/** A JSON body as the wire carries it. */
type Wire = string | number | boolean | ReadonlyArray<Wire> | { readonly [key: string]: Wire };

const json = (status: number, body: Wire) => Option.some(Response.json(body, { status }));

/** A status with no body (a HEAD's answer). */
const bare = (status: number, headers: Readonly<Record<string, string>> = {}) =>
  Option.some(new Response('', { status, headers }));

/** A 200 whose body breaks after its headers, as a connection reset does. */
const lostBody = () =>
  Option.some(
    new Response(
      new ReadableStream({
        pull: (controller) => controller.error('connection reset'),
      }),
      { status: 200 },
    ),
  );

const reasonIn = <A>(result: Result.Result<A, { readonly reason: string }>) =>
  Result.match(result, { onFailure: (e) => e.reason, onSuccess: () => '' });

const envelope = (result: Wire) => json(200, { success: true, errors: [], messages: [], result });

const page = (result: Wire, cursor: string) =>
  json(200, { success: true, errors: [], messages: [], result, result_info: { cursor } });

const refusal = (status: number, code: number, message: string) =>
  json(status, { success: false, errors: [{ code, message }], messages: [] });

const API_BASE = 'https://api.cloudflare.com/client/v4';
const OBJECTS = `${API_BASE}/accounts/acc/r2/buckets/cvr-hymns/objects`;

const credentials = Layer.mergeAll(
  Layer.succeed(
    CloudflareCredentials.Credentials,
    CloudflareCredentials.Credentials.of(
      Effect.succeed({ type: 'apiToken', apiToken: Redacted.make('token'), apiBaseUrl: API_BASE }),
    ),
  ),
  Layer.succeed(
    Cloudflare.CloudflareEnvironment,
    Cloudflare.CloudflareEnvironment.of(
      Effect.succeed({
        type: 'apiToken',
        apiToken: Redacted.make('token'),
        accountId: 'acc',
        source: { type: 'env' },
      }),
    ),
  ),
);

const r2Over = (script: Script) => {
  const { sent, layer } = recording(script);
  return { sent, layer: TargetR2.pipe(Layer.provide(Layer.merge(credentials, layer))) };
};

/** Bytes no text encoding keeps: a body sent through text would change them. */
const bytes = Uint8Array.from([0x00, 0x80, 0xff]);
const metadata = { contentType: 'audio/mpeg', cacheControl: 'public, max-age=604800' };
const stored = () => envelope({ etag: '"5289df737df57326fcdd22597afb1fac"', size: '3' });

/** Runs an effect while the test clock passes `duration`, and answers its result. */
const across = <A, E, R>(effect: Effect.Effect<A, E, R>, duration: Duration.Input) =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(Effect.result(effect));
    yield* TestClock.adjust(duration);
    return yield* Fiber.join(fiber);
  });

const put = Effect.gen(function* () {
  const target = yield* Target;
  return yield* target.put('audio/sdah/1.mp3', bytes, metadata);
});

describe('R2 upload', () => {
  it.effect('PUTs the bytes under the key with its slashes, the token and the metadata', () => {
    const { sent, layer } = r2Over(stored);
    return Effect.gen(function* () {
      const object = yield* put;
      expect(object).toEqual({ size: 3, etag: '"5289df737df57326fcdd22597afb1fac"' });
      expect(sent).toHaveLength(1);
      const [request] = sent;
      expect(request?.method).toBe('PUT');
      expect(request?.url).toBe(`${OBJECTS}/audio/sdah/1.mp3`);
      expect(request?.headers['authorization']).toBe('Bearer token');
      expect(request?.headers['content-type']).toBe('audio/mpeg');
      expect(request?.headers['cache-control']).toBe('public, max-age=604800');
      expect(request?.body).toEqual(Option.some(bytes));
    }).pipe(Effect.provide(layer));
  });

  it.effect('retries a 403 that Cloudflare names a transient auth blip, then stores', () => {
    const { sent, layer } = r2Over(
      inTurn(() => refusal(403, 10000, 'Authentication error'), stored),
    );
    return across(put, '30 seconds').pipe(
      Effect.map((result) => {
        expect(Result.isSuccess(result)).toBe(true);
        expect(sent).toHaveLength(2);
      }),
      Effect.provide(layer),
    );
  });

  it.effect('fails a permanent 403 at once, with Cloudflare’s code and message', () => {
    const { sent, layer } = r2Over(() => refusal(403, 10001, 'Method not allowed for token'));
    return across(put, '30 seconds').pipe(
      Effect.map((result) => {
        expect(sent).toHaveLength(1);
        expect(Result.isFailure(result)).toBe(true);
        const reason = Result.match(result, { onFailure: (e) => e.reason, onSuccess: () => '' });
        expect(reason).toContain('10001');
        expect(reason).toContain('Method not allowed for token');
      }),
      Effect.provide(layer),
    );
  });

  it.effect('retries a 5xx as distilled does, then fails with what Cloudflare said', () => {
    const { sent, layer } = r2Over(() => refusal(503, 10043, 'Service unavailable'));
    return across(put, '2 minutes').pipe(
      Effect.map((result) => {
        expect(sent).toHaveLength(9);
        const reason = Result.match(result, { onFailure: (e) => e.reason, onSuccess: () => '' });
        expect(reason).toContain('Service unavailable');
      }),
      Effect.provide(layer),
    );
  });

  it.effect('fails an upload that never answers once its time is up', () => {
    const { layer } = r2Over(() => Option.none());
    return across(put, '3 minutes').pipe(
      Effect.map((result) => {
        expect(reasonIn(result)).toContain('did not complete in 3 minutes');
      }),
      Effect.provide(layer),
    );
  });

  it.effect('fails an upload whose answer loses its body as that key’s StoreFailed', () => {
    const { sent, layer } = r2Over(lostBody);
    return Effect.gen(function* () {
      const result = yield* Effect.result(put);
      expect(sent).toHaveLength(1);
      expect(reasonIn(result)).toContain('put audio/sdah/1.mp3: the answer lost its body');
    }).pipe(Effect.provide(layer));
  });
});

describe('R2 in a run', () => {
  it.effect('a key whose upload answer loses its body fails alone, and the run goes on', () => {
    const puts: Array<string> = [];
    const lines: Array<string> = [];
    const console = { ...globalThis.console, log: (line: string) => void lines.push(line) };
    const recordingOf = (hymn: number) => Uint8Array.from([hymn & 0xff, hymn >> 8, 0x80, 0xff]);

    /** S3 holds every hymn; R2 stores each upload but loses hymn 7's answer. */
    const stores = Layer.unwrap(
      Effect.gen(function* () {
        const hash = yield* Hash;
        const source = Layer.succeed(
          Source,
          Source.of({
            head: (hymn) => {
              const body = recordingOf(hymn);
              return Effect.succeedSome({
                size: body.byteLength,
                etag: `"${hash.md5(body)}"`,
                contentType: 'audio/mpeg',
              });
            },
            get: (hymn) => Effect.succeed(recordingOf(hymn)),
          }),
        );
        const fill = Layer.succeed(
          Fill,
          Fill.of({
            tree: Effect.die('S3 has every hymn: the fill is never read'),
            get: () => Effect.die('S3 has every hymn: the fill is never read'),
          }),
        );
        const objects = new Map<string, TargetObject>();
        const { layer } = r2Over((request) => {
          if (request.method === 'GET') {
            const listed = Array.from(objects, ([key, object]) => ({ key, ...object }));
            return page(listed, '');
          }
          const key = decodeURIComponent(new URL(request.url).pathname).slice(
            new URL(OBJECTS).pathname.length + 1,
          );
          puts.push(key);
          if (key === 'audio/sdah/7.mp3') return lostBody();
          const body = Option.getOrElse(request.body, () => new Uint8Array());
          objects.set(key, { size: body.byteLength, etag: hash.md5(body) });
          return envelope({ etag: `"${hash.md5(body)}"`, size: String(body.byteLength) });
        });
        return Layer.mergeAll(source, fill, layer);
      }),
    );

    return run.pipe(
      Effect.provideService(Console.Console, console),
      Effect.result,
      Effect.map((result) => {
        expect(puts).toHaveLength(695);
        expect(lines.filter((line) => line.startsWith('failed'))).toEqual([
          expect.stringContaining('failed 7 r2: put audio/sdah/7.mp3: the answer lost its body'),
        ]);
        expect(lines.at(-1)).toContain('target=kept 0 uploaded 694 failed 1 verified 694/695');
        expect(Result.isFailure(result)).toBe(true);
      }),
      Effect.provide(Layer.provideMerge(stores, HashBun)),
    );
  });
});

describe('R2 listing', () => {
  it.effect('reads every page by its cursor, the sizes and ETags as R2 lists them', () => {
    const { sent, layer } = r2Over(
      inTurn(
        () => page([{ key: 'audio/sdah/1.mp3', size: 10, etag: 'a1' }], 'next'),
        () => page([{ key: 'audio/sdah/2.mp3', size: 20, etag: 'b2' }], ''),
      ),
    );
    return Effect.gen(function* () {
      const target = yield* Target;
      const listed = yield* target.list('audio/sdah/');
      expect([...listed]).toEqual([
        ['audio/sdah/1.mp3', { size: 10, etag: 'a1' }],
        ['audio/sdah/2.mp3', { size: 20, etag: 'b2' }],
      ]);
      expect(sent).toHaveLength(2);
      const first = new URL(sent[0]?.url ?? '');
      expect(`${first.origin}${first.pathname}`).toBe(OBJECTS);
      expect(first.searchParams.get('prefix')).toBe('audio/sdah/');
      expect(first.searchParams.get('per_page')).toBe('1000');
      expect(sent[0]?.headers['authorization']).toBe('Bearer token');
      expect(new URL(sent[1]?.url ?? '').searchParams.get('cursor')).toBe('next');
    }).pipe(Effect.provide(layer));
  });

  it.effect('fails a refused listing with Cloudflare’s message, so the verify reports it', () => {
    const { layer } = r2Over(() => refusal(404, 10006, 'The specified bucket does not exist.'));
    return Effect.gen(function* () {
      const target = yield* Target;
      const result = yield* Effect.result(target.list('audio/sdah/'));
      const reason = Result.match(result, { onFailure: (e) => e.reason, onSuccess: () => '' });
      expect(reason).toContain('10006');
      expect(reason).toContain('The specified bucket does not exist.');
    }).pipe(Effect.provide(layer));
  });

  it.effect('fails a listing whose answer loses its body as a StoreFailed', () => {
    const { layer } = r2Over(lostBody);
    return Effect.gen(function* () {
      const target = yield* Target;
      const result = yield* Effect.result(target.list('audio/sdah/'));
      expect(reasonIn(result)).toContain('list audio/sdah/: the answer lost its body');
    }).pipe(Effect.provide(layer));
  });

  it.effect('fails a listing that never completes once its time is up', () => {
    const { layer } = r2Over(() => Option.none());
    const list = Effect.gen(function* () {
      const target = yield* Target;
      return yield* target.list('audio/sdah/');
    });
    return across(list, '3 minutes').pipe(
      Effect.map((result) => {
        expect(reasonIn(result)).toContain('did not complete in 3 minutes');
      }),
      Effect.provide(layer),
    );
  });
});

const s3Over = (script: Script) => {
  const { sent, layer } = recording(script);
  return { sent, layer: SourceS3.pipe(Layer.provide(layer)) };
};

const head = (hymn: number) =>
  Effect.gen(function* () {
    const source = yield* Source;
    return yield* source.head(hymn);
  });

describe('S3 source', () => {
  it.effect('reads 200 as present, with its size and ETag', () => {
    const { sent, layer } = s3Over(() =>
      bare(200, { 'content-length': '2313865', etag: '"8a1f"', 'content-type': 'audio/mpeg' }),
    );
    return Effect.gen(function* () {
      expect(yield* head(1)).toEqual(
        Option.some({ size: 2313865, etag: '"8a1f"', contentType: 'audio/mpeg' }),
      );
      expect(sent[0]?.method).toBe('HEAD');
      expect(sent[0]?.url).toBe('https://cvr-hymns.s3.amazonaws.com/1.mp3');
    }).pipe(Effect.provide(layer));
  });

  it.effect('reads 403 and 404 as absent: S3 refuses a key it lacks', () => {
    const { layer } = s3Over(
      inTurn(
        () => bare(403),
        () => bare(404),
      ),
    );
    return Effect.gen(function* () {
      expect(yield* head(388)).toEqual(Option.none());
      expect(yield* head(388)).toEqual(Option.none());
    }).pipe(Effect.provide(layer));
  });

  it.effect('retries a 5xx and a 429 four times each, then fails: never absent', () => {
    const { sent, layer } = s3Over(
      inTurn(...Array.from({ length: 5 }, () => () => bare(503)), () => bare(429)),
    );
    return Effect.gen(function* () {
      expect(reasonIn(yield* across(head(5), '1 minute'))).toContain('HEAD answered 503');
      expect(sent).toHaveLength(5);
      expect(reasonIn(yield* across(head(5), '1 minute'))).toContain('HEAD answered 429');
      expect(sent).toHaveLength(10);
    }).pipe(Effect.provide(layer));
  });

  it.effect('fails another status at once, with no retry: never absent', () => {
    const { sent, layer } = s3Over(() => bare(400));
    return Effect.gen(function* () {
      expect(reasonIn(yield* across(head(5), '1 minute'))).toContain('HEAD answered 400');
      expect(sent).toHaveLength(1);
    }).pipe(Effect.provide(layer));
  });

  it.effect('downloads a recording’s exact bytes by GET', () => {
    const { sent, layer } = s3Over(() => Option.some(new Response(bytes)));
    return Effect.gen(function* () {
      const source = yield* Source;
      expect(yield* source.get(5)).toEqual(bytes);
      expect(sent[0]?.method).toBe('GET');
      expect(sent[0]?.url).toBe('https://cvr-hymns.s3.amazonaws.com/5.mp3');
    }).pipe(Effect.provide(layer));
  });

  it.effect('fails a download whose body is lost as a StoreFailed', () => {
    const { layer } = s3Over(lostBody);
    return Effect.gen(function* () {
      const source = yield* Source;
      expect(reasonIn(yield* Effect.result(source.get(5)))).toContain('5.mp3');
    }).pipe(Effect.provide(layer));
  });

  it.effect('fails a 200 with no size or ETag', () => {
    const { layer } = s3Over(() => bare(200, { etag: '"8a1f"' }));
    return Effect.gen(function* () {
      expect(Result.isFailure(yield* Effect.result(head(5)))).toBe(true);
    }).pipe(Effect.provide(layer));
  });

  it.effect('fails a download that never answers once its time is up', () => {
    const { layer } = s3Over(() => Option.none());
    const get = Effect.gen(function* () {
      const source = yield* Source;
      return yield* source.get(5);
    });
    return across(get, '3 minutes').pipe(
      Effect.map((result) => {
        const reason = Result.match(result, { onFailure: (e) => e.reason, onSuccess: () => '' });
        expect(reason).toContain('no answer');
      }),
      Effect.provide(layer),
    );
  });
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

const blob = (path: string, size = 10) => ({ path, type: 'blob', sha: 'f'.repeat(40), size });

const githubOver = (script: Script) => {
  const { sent, layer } = recording(script);
  return { sent, layer: FillGitHub.pipe(Layer.provide(layer)) };
};

const tree = Effect.gen(function* () {
  const fill = yield* Fill;
  return yield* fill.tree;
});

describe('GitHub fill', () => {
  it.effect('maps each recording to its hymn number, past the folder and the other files', () => {
    const { layer } = githubOver(() =>
      json(200, {
        truncated: false,
        tree: [
          { path: 'mp3', type: 'tree', sha: 'a'.repeat(40) },
          blob('mp3/001 – Praise to the Lord.mp3'),
          blob('mp3/388 – Don’t Forget the Sabbath.mp3', 2991377),
          blob('scripts/upload-hymns.ts'),
          blob('README.md'),
        ],
      }),
    );
    return Effect.gen(function* () {
      const entries = yield* tree;
      expect([...entries.keys()]).toEqual([1, 388]);
      expect(entries.get(388)).toEqual({
        hymn: 388,
        path: 'mp3/388 – Don’t Forget the Sabbath.mp3',
        size: 2991377,
        sha: 'f'.repeat(40),
      });
    }).pipe(Effect.provide(layer));
  });

  it.effect('retries a 5xx on the tree, then reads it', () => {
    const { sent, layer } = githubOver(
      inTurn(
        () => bare(503),
        () => json(200, { truncated: false, tree: [blob('mp3/001 – Praise to the Lord.mp3')] }),
      ),
    );
    return across(tree, '1 minute').pipe(
      Effect.map((result) => {
        expect(Result.isSuccess(result)).toBe(true);
        expect(sent).toHaveLength(2);
      }),
      Effect.provide(layer),
    );
  });

  it.effect('refuses a truncated tree', () => {
    const { layer } = githubOver(() => json(200, { truncated: true, tree: [] }));
    return Effect.gen(function* () {
      expect(Result.isFailure(yield* Effect.result(tree))).toBe(true);
    }).pipe(Effect.provide(layer));
  });

  it.effect('refuses a hymn with two recordings', () => {
    const { layer } = githubOver(() =>
      json(200, { truncated: false, tree: [blob('mp3/005 – A.mp3'), blob('mp3/5 – B.mp3')] }),
    );
    return Effect.gen(function* () {
      expect(Result.isFailure(yield* Effect.result(tree))).toBe(true);
    }).pipe(Effect.provide(layer));
  });

  it.effect('downloads a recording by its path, each segment escaped and the slashes kept', () => {
    const { sent, layer } = githubOver(() => Option.some(new Response(bytes)));
    const path = 'mp3/388 – Don’t Forget the Sabbath, Lord.mp3';
    return Effect.gen(function* () {
      const fill = yield* Fill;
      const got = yield* fill.get({ hymn: 388, path, size: 3, sha: 'f'.repeat(40) });
      expect(got).toEqual(bytes);
      expect(sent[0]?.url).toBe(
        'https://raw.githubusercontent.com/cevr/sda-hymns/4645e76cda1ed7eb8a95a6b59a1d29789406bbf8/mp3/388%20%E2%80%93%20Don%E2%80%99t%20Forget%20the%20Sabbath%2C%20Lord.mp3',
      );
    }).pipe(Effect.provide(layer));
  });

  it.effect('fails a download that never answers once its time is up', () => {
    const { layer } = githubOver(() => Option.none());
    const get = Effect.gen(function* () {
      const fill = yield* Fill;
      return yield* fill.get({ hymn: 388, path: 'mp3/388 – A.mp3', size: 2, sha: 'f'.repeat(40) });
    });
    return across(get, '3 minutes').pipe(
      Effect.map((result) => {
        const reason = Result.match(result, { onFailure: (e) => e.reason, onSuccess: () => '' });
        expect(reason).toContain('no answer');
      }),
      Effect.provide(layer),
    );
  });
});
