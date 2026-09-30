// The review's routes as a phone calls them: the index, a file answered in
// ranges (206, and 416 past its end), a frame, a length, a ref that leaves
// its root refused as unknown; and the hosts it answers to, the allowlist's
// beside loopback, a write from anywhere else refused.

import { BunServices, BunHttpPlatform } from '@effect/platform-bun';
import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import {
  CheckReport,
  ChoiceWrite,
  FilmChoices,
  LabWrite,
  ReviewDuration,
  ReviewIndex,
  reviewFileUrl,
} from '../core/schema.ts';
import { Choices } from './choices.ts';
import { ContentStore } from './content-store.ts';
import { FilmNotFound } from './errors.ts';
import { FilmRepo } from './film-repo.ts';
import { reviewHandler, refFromUrl } from './review-http.ts';
import { Review } from './review.ts';
import { type Change, SourceWriter } from './source-writer.ts';
import { StaticCheck } from './static-check.ts';

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
        { id: 'warm', styles: ['felt piano'], acts: [], state: 'current' },
        { id: 'bright', styles: ['strings'], acts: [], state: 'missing' },
      ],
    },
  ],
};

const PICK: Change = {
  film: 'f',
  scene: Option.none(),
  file: '/films/f/sound.ts',
  target: 'score play bright',
  before: "play: 'warm'",
  after: "play: 'bright'",
};

const unused = Effect.die('not used by the review routes');

/** Film `f`'s choices, or `FilmNotFound`. */
const listed = (film: string) => {
  if (film === 'f') return Effect.succeed(CHOICES);
  return Effect.fail(FilmNotFound.make({ film, dir: `/films/${film}` }));
};

/**
 * Film `f`'s services, faked: its choices, a pick of `bright` that lands, an
 * undo of it, and a check with nothing to say. Every other film is unknown.
 */
const filmServices = Layer.mergeAll(
  Layer.succeed(
    Choices,
    Choices.of({
      list: listed,
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
  FilmRepo.layer('/films').pipe(Layer.provide(ContentStore.layer)),
);

/** The review over `out/art` (a set of two), ffprobe answering 12.5 s and ffmpeg copying. */
const fixture = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const real = yield* ChildProcessSpawner.ChildProcessSpawner;
    const dir = yield* fs.makeTempDirectoryScoped();
    const out = path.join(dir, 'out');
    yield* fs.makeDirectory(path.join(out, 'art'), { recursive: true });
    yield* fs.writeFileString(path.join(out, 'art', 'roof.A.mp4'), '0123456789');
    yield* fs.writeFileString(path.join(out, 'art', 'roof.B.mp4'), 'abcdefghij');
    yield* fs.writeFileString(path.join(dir, 'secret.mp4'), 'secret');
    const spawner = ChildProcessSpawner.make((command) => {
      if (command._tag !== 'StandardCommand') return real.spawn(command);
      if (command.command === 'ffprobe') return real.spawn(ChildProcess.make('echo', ['12.5']));
      const args = command.args;
      const input = args[args.indexOf('-i') + 1] ?? '';
      return real.spawn(ChildProcess.make('cp', [input, args.at(-1) ?? '']));
    });
    return Review.layer({
      roots: [{ label: 'out', path: out }],
      cache: path.join(dir, 'cache'),
      phoneOver: 1000,
      maxVideo: 10_000,
      phoneCopies: false,
    }).pipe(
      Layer.provide(Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner)),
      Layer.merge(Layer.succeed(Root, dir)),
      Layer.merge(filmServices),
    );
  }),
).pipe(Layer.provideMerge(Layer.mergeAll(BunServices.layer, BunHttpPlatform.layer)));

/** Where the review listens: every interface, on 8229. */
const bound = { hostname: '0.0.0.0', port: 8229 } as const;
const allowed = { hosts: ['box.example:8229'] };

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`http://127.0.0.1:8229${path}`, { method: 'GET', headers });

const ask = (request: Request) =>
  Effect.gen(function* () {
    const review = yield* reviewHandler(allowed);
    return yield* Effect.promise(() => review(request, bound));
  });

const body = (response: Response) => Effect.promise(() => response.text());

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
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect(
    'a ref out of its root, or naming nothing, is a 404; a phone copy not made yet too',
    () =>
      Effect.gen(function* () {
        for (const path of [
          '/review/files/out/../secret.mp4',
          '/review/files/out/%2E%2E/secret.mp4',
          '/review/files/out/art/none.mp4',
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
      expect(yield* body(unknown)).toContain('FilmNotFound');
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
