// The review's routes as a phone calls them: the index, a file answered in
// ranges (206, and 416 past its end), a frame, a length, a ref that leaves
// its root refused as unknown; and the hosts it answers to, the allowlist's
// beside loopback, a write from anywhere else refused.

import { BunServices, BunHttpPlatform } from '@effect/platform-bun';
import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import {
  CheckReport,
  ChoiceWrite,
  FilmChoices,
  LabWrite,
  ReviewDuration,
  ReviewIndex,
} from '../core/schema.ts';
import { Refusal, ReviewHttpApi, reviewFileUrl, routesOf } from '../core/api.ts';
import { Choices } from './choices.ts';
import { ContentStore } from './content-store.ts';
import { FilmRepo } from './film-repo.ts';
import { reviewHandler, refFromUrl } from './review-http.ts';
import { Review } from './review.ts';
import { type Change, SourceWriter } from './source-writer.ts';
import { StaticCheck } from './static-check.ts';
import { foreignRequests, reviewMedia } from './testing.ts';

class Root extends Context.Service<Root, string>()('test/Root') {}

/** Film `f`'s choices: one score of two options, `warm` playing. */
const CHOICES: FilmChoices = {
  film: 'f',
  pictures: [],
  choices: [
    {
      _tag: 'ScoreChoice',
      picked: 'warm',
      variants: [
        { id: 'warm', styles: ['felt piano'], movements: [], state: 'current' },
        { id: 'bright', styles: ['strings'], movements: [], state: 'missing' },
      ],
    },
  ],
};

/** The pick of `bright`, in `sound.ts` of film `f` under `films`. */
const pickIn = (films: string): Change => ({
  film: 'f',
  scene: Option.none(),
  file: `${films}/f/sound.ts`,
  target: 'score play bright',
  before: "play: 'warm'",
  after: "play: 'bright'",
});

const unused = Effect.die('not used by the review routes');

/**
 * Film `f`'s services, faked over a films folder that holds only `f`: its
 * choices, a pick of `bright` that lands, an undo of it, and a check with
 * nothing to say. Every other name is no film of the app's.
 */
const filmServices = (films: string, PICK = pickIn(films)) =>
  Layer.mergeAll(
    Layer.succeed(
      Choices,
      Choices.of({
        list: () => Effect.succeed(CHOICES),
        pickScore: (_, option) =>
          Effect.succeed({
            file: PICK.file,
            target: `score play ${option}`,
            change: Option.some(PICK),
          }),
        curate: () => unused,
        scoreMix: () => unused,
        takeAudio: () => unused,
        takeMix: () => unused,
      }),
    ),
    Layer.succeed(
      SourceWriter,
      SourceWriter.of({
        write: () => unused,
        around: () => unused,
        undo: () => Effect.succeed({ ...PICK, target: `undo ${PICK.target}` }),
        redo: () => unused,
        history: () =>
          Effect.succeed({ undo: Option.none(), redo: Option.some(PICK), latest: Option.none() }),
      }),
    ),
    Layer.succeed(StaticCheck, StaticCheck.of({ run: () => Effect.succeed([]) })),
    FilmRepo.layer(films).pipe(Layer.provide(ContentStore.layer)),
  );

/** The review over `out/art` (a set of two), its videos 12.5 s long and a frame the video copied. */
const fixture = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped();
    const out = path.join(dir, 'out');
    yield* fs.makeDirectory(path.join(out, 'art'), { recursive: true });
    yield* fs.writeFileString(path.join(out, 'art', 'roof.A.mp4'), '0123456789');
    yield* fs.writeFileString(path.join(out, 'art', 'roof.B.mp4'), 'abcdefghij');
    yield* fs.writeFileString(path.join(out, 'art', 'roof.vtt'), 'WEBVTT');
    yield* fs.writeFileString(path.join(out, 'art', 'review.json'), '{ "title": "Art" }');
    yield* fs.writeFileString(path.join(dir, 'secret.mp4'), 'secret');
    const films = path.join(dir, 'films');
    yield* fs.makeDirectory(path.join(films, 'f', 'scenes'), { recursive: true });
    yield* fs.writeFileString(path.join(films, 'f', 'scenes', 'index.ts'), 'export {};\n');
    // A folder beside the films, reached by a path that climbs out: never a film.
    yield* fs.makeDirectory(path.join(dir, 'beside', 'scenes'), { recursive: true });
    yield* fs.writeFileString(path.join(dir, 'beside', 'scenes', 'index.ts'), 'export {};\n');
    return Review.layer({
      roots: [{ label: 'out', path: out }],
      cache: path.join(dir, 'cache'),
      phoneOver: 1000,
      maxVideo: 10_000,
      phoneCopies: false,
    }).pipe(
      Layer.provide(reviewMedia([])),
      Layer.merge(Layer.succeed(Root, dir)),
      Layer.merge(filmServices(films)),
    );
  }),
).pipe(Layer.provideMerge(Layer.mergeAll(BunServices.layer, BunHttpPlatform.layer)));

/** Where the review listens: every interface, on 8229. */
const bound = { hostname: '0.0.0.0', port: 8229 } as const;
const allowed = { hosts: ['box.example:8229'] };

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`http://127.0.0.1:8229${path}`, { method: 'GET', headers });

/** The app's page: its path echoed, so a test sees the request reached it. */
const page = (request: Request) =>
  Effect.runPromise(Effect.sync(() => new Response(`page ${new URL(request.url).pathname}`)));

const ask = (request: Request) =>
  Effect.gen(function* () {
    const review = yield* reviewHandler(allowed, page);
    return yield* Effect.promise(() => review(request, bound));
  });

const body = (response: Response) => Effect.promise(() => response.text());

/** A refusal's JSON, decoded as the page decodes it. */
const refusalOf = Schema.decodeSync(Schema.fromJsonString(Refusal));

describe('review routes', () => {
  test('reads a ref from a files URL, each segment decoded', () => {
    expect(refFromUrl('/review/files/out/a%20b/c.mp4?x=1', '/review/files/')).toEqual(
      Option.some('out/a b/c.mp4'),
    );
    expect(refFromUrl('/review/files/out/%E0%A4%A', '/review/files/')).toEqual(Option.none());
    expect(reviewFileUrl('out/a b/#1.mp4')).toBe('/review/files/out/a%20b/%231.mp4');
  });

  it.effect('answers the index, a length and a frame', () =>
    Effect.gen(function* () {
      const index = yield* ask(get('/review/index'));
      expect(index.status).toBe(200);
      const decoded = yield* Schema.decodeUnknownEffect(ReviewIndex)(
        yield* Effect.promise(() => index.json()),
      );
      expect(decoded.folders.map((f) => [f.ref, f.sets.map((s) => s.clip)])).toEqual([
        ['out/art', ['roof']],
      ]);
      const length = yield* ask(get('/review/duration?ref=out/art/roof.A.mp4'));
      expect(
        yield* Schema.decodeUnknownEffect(ReviewDuration)(
          yield* Effect.promise(() => length.json()),
        ),
      ).toEqual({ seconds: 12.5 });
      const frame = yield* ask(get('/review/frame?ref=out/art/roof.A.mp4&t=2&w=320'));
      expect(frame.status).toBe(200);
      expect(frame.headers.get('content-type')).toBe('image/jpeg');
      expect(frame.headers.get('cache-control')).toBe('max-age=86400');
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect('serves a file whole, a range of it as 206, and past its end as 416', () =>
    Effect.gen(function* () {
      const whole = yield* ask(get(reviewFileUrl('out/art/roof.B.mp4')));
      expect(whole.status).toBe(200);
      expect(whole.headers.get('accept-ranges')).toBe('bytes');
      expect(whole.headers.get('content-type')).toBe('video/mp4');
      expect(yield* body(whole)).toBe('abcdefghij');
      const part = yield* ask(get(reviewFileUrl('out/art/roof.B.mp4'), { range: 'bytes=2-5' }));
      expect(part.status).toBe(206);
      expect(part.headers.get('content-range')).toBe('bytes 2-5/10');
      expect(yield* body(part)).toBe('cdef');
      const past = yield* ask(get(reviewFileUrl('out/art/roof.B.mp4'), { range: 'bytes=20-' }));
      expect(past.status).toBe(416);
      const captions = yield* ask(get(reviewFileUrl('out/art/roof.vtt')));
      expect(captions.headers.get('content-type')).toBe('text/vtt; charset=utf-8');
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect(
    'a ref out of its root, naming nothing or nothing listed, is a 404; a phone copy not made yet too',
    () =>
      Effect.gen(function* () {
        for (const path of [
          '/review/files/out/../secret.mp4',
          '/review/files/out/%2E%2E/secret.mp4',
          '/review/files/out/art/none.mp4',
          // There, but nothing the index lists.
          '/review/files/out/art/review.json',
          '/review/files/elsewhere/x.mp4',
          '/review/phone/out/art/roof.A.mp4',
          '/review/duration?ref=out/../secret.mp4',
        ])
          expect([path, (yield* ask(get(path))).status]).toEqual([path, 404]);
        expect((yield* ask(get('/review/frame'))).status).toBe(400);
      }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect('answers the allowlist and loopback, and no other host or site', () =>
    Effect.gen(function* () {
      const through = yield* ask(get('/review/index', { host: 'box.example:8229' }));
      expect(through.status).toBe(200);
      const local = yield* ask(get('/review/index', { host: 'localhost:8229' }));
      expect(local.status).toBe(200);
      const rebound = yield* ask(get('/review/index', { host: 'evil.example:8229' }));
      expect(rebound.status).toBe(403);
      const cross = yield* ask(
        get('/review/index', { host: 'box.example:8229', 'sec-fetch-site': 'cross-site' }),
      );
      expect(cross.status).toBe(403);
      // A write through the proxy's TLS origin is the page's own; another site's is not.
      const write = (origin: string) =>
        new Request('http://127.0.0.1:8229/review/index', {
          method: 'POST',
          headers: { host: 'box.example:8229', origin, 'content-type': 'application/json' },
          body: '{}',
        });
      expect((yield* ask(write('https://box.example:8229'))).status).toBe(404);
      expect((yield* ask(write('https://evil.example'))).status).toBe(403);
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect('every route the review API declares answers a foreign Host 403', () =>
    Effect.gen(function* () {
      const routes = routesOf(ReviewHttpApi);
      expect(routes.length).toBeGreaterThan(10);
      for (const request of foreignRequests(routes, 'http://127.0.0.1:8229', 'f')) {
        const res = yield* ask(request);
        const refusal = yield* Effect.promise(() => res.json());
        const route = `${request.method} ${new URL(request.url).pathname}`;
        expect([route, res.status, refusal._tag]).toEqual([route, 403, 'RequestRefused']);
      }
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect("passes the app's page the rest, behind the same hosts", () =>
    Effect.gen(function* () {
      for (const path of ['/', '/chunk-a1.js', '/films/tiny/narration/s1.mp3']) {
        const own = yield* ask(get(path, { host: 'box.example:8229' }));
        expect([path, own.status, yield* body(own)]).toEqual([path, 200, `page ${path}`]);
        const rebound = yield* ask(get(path, { host: 'evil.example:8229' }));
        expect([path, rebound.status]).toEqual([path, 403]);
      }
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );
});

/** A pick as the review's page sends it through the proxy: JSON, from `origin`. */
const pick = (film: string, body: string, origin: string, type = 'application/json') =>
  new Request(`http://127.0.0.1:8229/lab/${film}/options/score/pick`, {
    method: 'POST',
    headers: { host: 'box.example:8229', origin, 'content-type': type },
    body,
  });

describe("a film's options", () => {
  it.effect('are listed for any film the app has; an unknown one is 404', () =>
    Effect.gen(function* () {
      const listed = yield* ask(get('/lab/f/options'));
      expect(listed.status).toBe(200);
      const choices = yield* Schema.decodeEffect(Schema.fromJsonString(FilmChoices))(
        yield* body(listed),
      );
      expect(choices).toEqual(CHOICES);
      const unknown = yield* ask(get('/lab/nope/options'));
      expect(unknown.status).toBe(404);
      expect(refusalOf(yield* body(unknown))).toMatchObject({
        _tag: 'FilmUnknown',
        film: 'nope',
        known: ['f'],
      });
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect('a film named by a path is no film: 404, its answer naming no folder of its own', () =>
    Effect.gen(function* () {
      const dir = yield* Root;
      for (const film of ['..%2Fbeside', '%2E%2E%2Fbeside', encodeURIComponent(`${dir}/films/f`)])
        for (const route of ['options', 'check', 'options/score/warm/mix']) {
          const answer = yield* ask(get(`/lab/${film}/${route}`));
          const text = yield* body(answer);
          expect([film, route, answer.status]).toEqual([film, route, 404]);
          // Only the name as asked, and the films there are: no folder of the server's.
          expect(refusalOf(text)).toMatchObject({
            _tag: 'FilmUnknown',
            film: decodeURIComponent(film),
            known: ['f'],
          });
        }
      const undo = yield* ask(
        new Request('http://127.0.0.1:8229/lab/..%2Fbeside/undo', {
          method: 'POST',
          headers: { host: 'box.example:8229', 'content-type': 'application/json' },
          body: '{}',
        }),
      );
      expect(undo.status).toBe(404);
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect("a pick is answered with the file it changed, the choices, and the film's check", () =>
    Effect.gen(function* () {
      const picked = yield* ask(pick('f', '{"option":"bright"}', 'https://box.example:8229'));
      expect(picked.status).toBe(200);
      const answer = yield* Schema.decodeEffect(Schema.fromJsonString(ChoiceWrite))(
        yield* body(picked),
      );
      expect(answer).toEqual({
        file: 'sound.ts',
        target: 'score play bright',
        choices: CHOICES,
        findings: [],
      });
      // The film's undo is the lab's: the pick put back, and what Redo would make again.
      const undo = new Request('http://127.0.0.1:8229/lab/f/undo', {
        method: 'POST',
        headers: { host: 'box.example:8229', 'content-type': 'application/json' },
        body: '{}',
      });
      const undone = yield* Schema.decodeEffect(Schema.fromJsonString(LabWrite))(
        yield* body(yield* ask(undo)),
      );
      expect(undone).toEqual({ file: 'sound.ts', target: 'undo score play bright', findings: [] });
      const check = yield* Schema.decodeEffect(Schema.fromJsonString(CheckReport))(
        yield* body(yield* ask(get('/lab/f/check'))),
      );
      expect(check).toEqual({
        findings: [],
        redo: { file: 'sound.ts', target: 'score play bright' },
      });
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect('a pick from another site, or not as JSON, is refused before it runs', () =>
    Effect.gen(function* () {
      const cross = yield* ask(pick('f', '{"option":"bright"}', 'https://evil.example'));
      expect(cross.status).toBe(403);
      const form = yield* ask(pick('f', 'option=bright', 'https://box.example:8229', 'text/plain'));
      expect(form.status).toBe(415);
      const bad = yield* ask(pick('f', '{"choice":"bright"}', 'https://box.example:8229'));
      expect(bad.status).toBe(400);
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );
});
