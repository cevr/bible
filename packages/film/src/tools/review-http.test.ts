// The review's routes as a phone calls them: the index, a file answered in
// ranges (206, and 416 past its end), a frame, a length, a ref that leaves
// its root refused as unknown; and the hosts it answers to, the allowlist's
// beside loopback, a write from anywhere else refused.

import { BunServices, BunHttpPlatform } from '@effect/platform-bun';
import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Context, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { CheckReport, LabWrite } from '../core/schema.ts';
import {
  ProjectView,
  Refusal,
  ReviewHttpApi,
  Steps,
  reviewFileUrl,
  routesOf,
} from '../core/api.ts';
import { type Project, emptyCatalogue, projectOf } from '../core/catalogue.ts';
import { ChoiceWrite, FilmChoices, SoundCheck, withSay } from '../core/choice.ts';
import { ReviewDuration, ReviewIndex } from '../core/review.ts';
import { SceneNotRendered } from '../core/refusals.ts';
import { Choices } from './choices.ts';
import { FilmFolder } from './film-repo.ts';
import { reviewHandler, refFromUrl } from './review-http.ts';
import { Review } from './review.ts';
import { type Change, SourceWriter } from './source-writer.ts';
import { foreignRequests, freshFilm, reviewMedia } from './testing.ts';

class Root extends Context.Service<Root, string>()('test/Root') {}

/** A score option as film `f` offers it. */
const option = (id: string, picked: boolean) => ({
  id,
  label: id,
  lines: [],
  state: 'current' as const,
  picked,
  verbs: Arr.filter(['pick'] as const, () => !picked),
  media: { _tag: 'Heard' as const, alone: false, inPlace: true },
  key: id,
});

/** Film `f`'s choices: one score of two options, `warm` playing. */
const CHOICES: FilmChoices = {
  film: 'f',
  pictures: [],
  points: [
    withSay(Option.none(), {
      ref: { _tag: 'Score' },
      address: Option.some({ _tag: 'Film' }),
      title: 'score',
      lines: [],
      variants: [option('warm', true), option('bright', false)],
    }),
  ],
};

/** Film `f`'s project: one scene, `a`, not yet rendered. */
const PROJECT: Project = projectOf(
  emptyCatalogue('f'),
  { key: 'fk', sound: Option.none(), acts: [], scenes: [{ scene: 'a', key: 'k1' }] },
  'main',
);

/** The `film project` args each fresh run was asked for. */
const projectRuns: Array<ReadonlyArray<string>> = [];

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
        checked: () => Effect.succeed({ choices: CHOICES, findings: [] }),
        pick: (_, asked) =>
          Effect.succeed({
            file: PICK.file,
            target: `${asked.point} play ${asked.variant}`,
            change: Option.some(PICK),
          }),
        knob: () => unused,
        say: () => Effect.succeed(CHOICES),
        alone: () => unused,
        inPlace: () => unused,
      }),
    ),
    freshFilm({
      project: (args) =>
        Effect.suspend(() => {
          projectRuns.push(args);
          if (args.includes('--scene'))
            return Effect.fail(SceneNotRendered.make({ film: 'f', scene: 'a', variant: 'main' }));
          return Effect.succeed(PROJECT);
        }),
      check: (_, leg) =>
        Effect.succeed(
          Arr.filter(
            [{ level: 'warning', tag: 'DeadAir', message: 'no sound 3.0-4.2 s' }] as const,
            () => leg === 'sound',
          ),
        ),
    }),
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
    FilmFolder.layer(films),
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
    yield* fs.writeFileString(
      path.join(out, 'art', 'review.json'),
      '{ "title": "Art", "docs": ["roof.vtt"], "sets": { "roof": { "order": ["A", "B"] } } }',
    );
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
      expect(decoded.folders.map((f) => [f.ref, f.sets.map((s) => s.id)])).toEqual([
        ['out/art', ['render:roof']],
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

/** A POST as the review's page sends it through the proxy: JSON, from `origin`. */
const post = (route: string, body: string, origin: string, type = 'application/json') =>
  new Request(`http://127.0.0.1:8229${route}`, {
    method: 'POST',
    headers: { host: 'box.example:8229', origin, 'content-type': type },
    body,
  });

/** A pick as the review's page sends it. */
const pick = (film: string, body: string, origin: string, type = 'application/json') =>
  post(`/lab/${film}/choices/pick`, body, origin, type);

const PICK_BRIGHT = '{"point":"score","variant":"bright","verb":"pick"}';
const HOME = 'https://box.example:8229';

describe("a film's choices", () => {
  it.effect('are listed for any film the app has; an unknown one is 404', () =>
    Effect.gen(function* () {
      const listed = yield* ask(get('/lab/f/choices'));
      expect(listed.status).toBe(200);
      const choices = yield* Schema.decodeEffect(Schema.fromJsonString(FilmChoices))(
        yield* body(listed),
      );
      expect(choices).toEqual(CHOICES);
      const unknown = yield* ask(get('/lab/nope/choices'));
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
        for (const route of ['choices', 'check', 'choices/mix?point=score&variant=warm']) {
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
      const picked = yield* ask(pick('f', PICK_BRIGHT, HOME));
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
      const cross = yield* ask(pick('f', PICK_BRIGHT, 'https://evil.example'));
      expect(cross.status).toBe(403);
      const form = yield* ask(pick('f', 'point=score', HOME, 'text/plain'));
      expect(form.status).toBe(415);
      const bad = yield* ask(pick('f', '{"point":"score","variant":"bright","verb":"keep"}', HOME));
      expect(bad.status).toBe(400);
      // A body that does not decode answers why, as a refusal the page reads.
      const refusal = refusalOf(yield* body(bad));
      expect(refusal).toMatchObject({ _tag: 'RequestInvalid', part: 'Payload' });
      expect(refusal.message).toContain('verb');
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect('a query or a body that does not decode answers RequestInvalid, naming it', () =>
    Effect.gen(function* () {
      const answers = yield* Effect.forEach(
        [
          get('/review/frame'),
          get('/review/project/f?variant=Bad%20Name'),
          post(
            '/review/project/f/say',
            '{"address":{"_tag":"Nope"},"say":{"_tag":"Approve"}}',
            HOME,
          ),
        ],
        (request) =>
          Effect.gen(function* () {
            const res = yield* ask(request);
            return [res.status, refusalOf(yield* body(res))] as const;
          }),
      );
      expect(answers).toMatchObject([
        [400, { _tag: 'RequestInvalid', part: 'Query', reason: 'Missing key at ["ref"]' }],
        [400, { _tag: 'RequestInvalid', part: 'Query' }],
        [400, { _tag: 'RequestInvalid', part: 'Payload' }],
      ]);
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect("the sound check after a pick answers the mix's findings", () =>
    Effect.gen(function* () {
      const checked = yield* ask(get('/lab/f/choices/check'));
      expect(checked.status).toBe(200);
      expect(
        yield* Schema.decodeEffect(Schema.fromJsonString(SoundCheck))(yield* body(checked)),
      ).toEqual({
        findings: [{ level: 'warning', tag: 'DeadAir', message: 'no sound 3.0-4.2 s' }],
      });
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect("a variant's say answers the choices as they stand", () =>
    Effect.gen(function* () {
      const approved = yield* ask(
        post(
          '/lab/f/choices/say',
          '{"point":"score","variant":"warm","say":{"_tag":"Approve"}}',
          HOME,
        ),
      );
      expect(approved.status).toBe(200);
      const withdrawn = yield* ask(
        post(
          '/lab/f/choices/say',
          '{"point":"score","variant":"warm","say":{"_tag":"Withdraw"}}',
          HOME,
        ),
      );
      expect(withdrawn.status).toBe(200);
      const said = yield* ask(
        post(
          '/lab/f/choices/say',
          '{"point":"score","variant":"warm","say":{"_tag":"Comment","text":""}}',
          HOME,
        ),
      );
      // An empty comment is no comment.
      expect(said.status).toBe(400);
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect("the steps are the film's history alone: no check runs", () =>
    Effect.gen(function* () {
      const steps = yield* ask(get('/lab/f/steps'));
      expect(steps.status).toBe(200);
      expect(yield* Schema.decodeEffect(Schema.fromJsonString(Steps))(yield* body(steps))).toEqual({
        redo: { file: 'sound.ts', target: 'score play bright' },
      });
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );
});

describe("a film's project", () => {
  const decodeView = Schema.decodeEffect(Schema.fromJsonString(ProjectView));
  const say = (payload: string) => post('/review/project/f/say', payload, HOME);

  it.effect('is read, and said of, in a fresh run of `film project … --json`', () =>
    Effect.gen(function* () {
      projectRuns.length = 0;
      const read = yield* ask(get('/review/project/f'));
      expect(read.status).toBe(200);
      expect(yield* decodeView(yield* body(read))).toEqual({
        project: PROJECT,
        folder: Option.none(),
        videos: {},
      });
      const all = yield* ask(say('{"address":{"_tag":"Film"},"say":{"_tag":"Approve"}}'));
      expect((yield* decodeView(yield* body(all))).project).toEqual(PROJECT);
      const act = yield* ask(
        say('{"address":{"_tag":"Act","act":"one"},"say":{"_tag":"Approve"}}'),
      );
      expect(act.status).toBe(200);
      const withdrawn = yield* ask(
        say('{"address":{"_tag":"Act","act":"one"},"say":{"_tag":"Withdraw"}}'),
      );
      expect(withdrawn.status).toBe(200);
      const said = yield* ask(
        say(
          '{"address":{"_tag":"Film"},"say":{"_tag":"Comment","text":"--all of it"},"variant":"ink"}',
        ),
      );
      expect(said.status).toBe(200);
      // A comment's text is past `--`, so one that starts with a dash is never a flag.
      expect(projectRuns).toEqual([
        ['f', '--json'],
        ['approve', 'f', '--all', '--json'],
        ['approve', 'f', '--act', 'one', '--json'],
        ['withdraw', 'f', '--act', 'one', '--json'],
        ['comment', 'f', '--variant', 'ink', '--json', '--', '--all of it'],
      ]);
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect("a scene with no render is the run's refusal: 404", () =>
    Effect.gen(function* () {
      const refused = yield* ask(
        say('{"address":{"_tag":"Scenes","ids":["a"]},"say":{"_tag":"Approve"}}'),
      );
      expect(refused.status).toBe(404);
      expect(refusalOf(yield* body(refused))).toMatchObject({
        _tag: 'SceneNotRendered',
        scene: 'a',
      });
      const unknown = yield* ask(get('/review/project/nope'));
      expect(unknown.status).toBe(404);
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect('a short is no part of the project tree: its address is a 400, and nothing runs', () =>
    Effect.gen(function* () {
      projectRuns.length = 0;
      const short = yield* ask(
        say('{"address":{"_tag":"Short","id":"s"},"say":{"_tag":"Approve"}}'),
      );
      expect(short.status).toBe(400);
      const said = yield* ask(
        say('{"address":{"_tag":"Short","id":"s"},"say":{"_tag":"Comment","text":"cut it"}}'),
      );
      expect(said.status).toBe(400);
      expect(projectRuns).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect('a comment on more than one scene is a 400, and nothing runs', () =>
    Effect.gen(function* () {
      projectRuns.length = 0;
      const said = yield* ask(
        say('{"address":{"_tag":"Scenes","ids":["a","b"]},"say":{"_tag":"Comment","text":"x"}}'),
      );
      expect(said.status).toBe(400);
      expect(refusalOf(yield* body(said))).toMatchObject({
        _tag: 'RequestInvalid',
        part: 'Payload',
      });
      expect(projectRuns).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect('a variant the CLI would refuse is a 400, and never reaches its argv', () =>
    Effect.gen(function* () {
      projectRuns.length = 0;
      const flag = yield* ask(get('/review/project/f?variant=--all'));
      expect(flag.status).toBe(400);
      const all = yield* ask(
        say('{"address":{"_tag":"Film"},"say":{"_tag":"Approve"},"variant":"Ink Two"}'),
      );
      expect(all.status).toBe(400);
      expect(projectRuns).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect('a scene or an act named like a flag is a 400, and never reaches its argv', () =>
    Effect.gen(function* () {
      projectRuns.length = 0;
      for (const address of [
        '{"_tag":"Scenes","ids":["--all"]}',
        '{"_tag":"Scenes","ids":["a","-x"]}',
        '{"_tag":"Act","act":"--all"}',
      ]) {
        const said = yield* ask(say(`{"address":${address},"say":{"_tag":"Approve"}}`));
        expect(said.status).toBe(400);
        expect(refusalOf(yield* body(said))).toMatchObject({
          _tag: 'RequestInvalid',
          part: 'Payload',
        });
      }
      expect(projectRuns).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );
});
