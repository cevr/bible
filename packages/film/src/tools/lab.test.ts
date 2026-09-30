// The lab's routes as the page calls them: a note posted with its still is
// listed and served, a wait hands back the change, a user reply reopens the
// thread, and a bad body or an unknown note answers with its status.

import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Effect, Layer, Path, Schema } from 'effect';
import { Base64 } from 'effect/encoding';
import { HttpPlatform } from 'effect/http';
import { LabHttpApi, Refusal, routesOf } from '../core/api.ts';
import { NotesFile, NotesWait } from '../core/schema.ts';
import { ContentStore } from './content-store.ts';
import { labHandler } from './lab.ts';
import { FilmRepo } from './film-repo.ts';
import { NotesStore } from './notes-store.ts';
import { foreignRequests, memoryFileSystem, noSource, noStudio, text } from './testing.ts';

const files = () => new Map<string, Uint8Array>();

const labLayer = (store: Map<string, Uint8Array>) =>
  Layer.mergeAll(
    NotesStore.layer,
    FilmRepo.layer('/films'),
    noSource,
    noStudio,
    HttpPlatform.layer,
  ).pipe(
    Layer.provide(ContentStore.layer),
    Layer.provideMerge([
      memoryFileSystem(store),
      Path.layer,
      ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_LAB: '/lab' })),
    ]),
  );

const png = text('frame');

/** Where the lab server listens: the only host the routes answer to. */
const bound = { hostname: '127.0.0.1', port: 4401 } as const;

const at = (path: string) => `http://127.0.0.1:4401${path}`;

/** A write as the lab's page sends it: a JSON body, and any headers of the test's own. */
const post = (path: string, body: string, headers: Record<string, string> = {}) =>
  new Request(at(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });

/** A GET with the test's headers. */
const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(at(path), { method: 'GET', headers });

const draft = `{"scene":"hand","T":230.38,"frame":6911,"cue":{"name":"topple","edge":"end"},"box":{"x":860,"y":640,"w":200,"h":120},"text":"too low","still":"${Base64.encode(png)}"}`;

describe('lab routes', () => {
  it.effect('a posted note is listed, its still served, and a wait returns it', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler('f');
      const posted = yield* Effect.promise(() => lab(post('/lab/f/notes', draft), bound));
      expect(posted.status).toBe(200);
      const listed = yield* Effect.promise(() =>
        lab(get('/lab/f/notes'), bound).then((r) => r.json()),
      );
      const file = yield* Schema.decodeUnknownEffect(NotesFile)(listed);
      expect(file.notes.map((n) => [n.id, n.scene, n.cue?.name, n.still])).toEqual([
        ['n1', 'hand', 'topple', 'n1.png'],
      ]);
      const still = yield* Effect.promise(() => lab(get('/lab/f/stills/n1.png'), bound));
      expect(still.headers.get('content-type')).toBe('image/png');
      expect(new Uint8Array(yield* Effect.promise(() => still.arrayBuffer()))).toEqual(png);
      const waited = yield* Effect.promise(() =>
        lab(get('/lab/f/notes/wait?since=0&timeout=1'), bound).then((r) => r.json()),
      );
      const wait = yield* Schema.decodeUnknownEffect(NotesWait)(waited);
      expect(wait.events.map((e) => e._tag)).toEqual(['NoteAdded']);
      expect(wait.cursor).toBe(1);
    }).pipe(Effect.scoped, Effect.provide(labLayer(files()))),
  );

  it.effect('a user reply reopens the note; resolve closes it', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler('f');
      yield* Effect.promise(() => lab(post('/lab/f/notes', draft), bound));
      const replied = yield* Effect.promise(() =>
        lab(post('/lab/f/notes/n1/reply', '{"text":"lower still"}'), bound).then((r) => r.json()),
      );
      expect(replied).toMatchObject({
        status: 'open',
        thread: [{ by: 'user', text: 'lower still' }],
      });
      const resolved = yield* Effect.promise(() =>
        lab(post('/lab/f/notes/n1/resolve', '{}'), bound).then((r) => r.json()),
      );
      expect(resolved).toMatchObject({ status: 'resolved' });
    }).pipe(Effect.scoped, Effect.provide(labLayer(files()))),
  );

  it.effect('a bad body is a 400, an unknown note a 404, a path for a still a 404', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler('f');
      const status = (req: Request) => Effect.promise(() => lab(req, bound).then((r) => r.status));
      expect(yield* status(post('/lab/f/notes', '{"scene":"hand"}'))).toBe(400);
      expect(yield* status(post('/lab/f/notes/n9/resolve', '{}'))).toBe(404);
      expect(yield* status(get('/lab/f/stills/..%2Fnotes.json'))).toBe(404);
    }).pipe(Effect.scoped, Effect.provide(labLayer(files()))),
  );

  it.effect(
    'every route names its film: another film is a 404 FilmUnknown, none a 404; nothing is written',
    () =>
      Effect.gen(function* () {
        const lab = yield* labHandler('f');
        const answer = (req: Request) =>
          Effect.gen(function* () {
            const res = yield* Effect.promise(() => lab(req, bound));
            return { status: res.status, body: yield* Effect.promise(() => res.text()) };
          });
        // A page for film g, open on the lab that serves f.
        const other = yield* answer(post('/lab/g/notes', draft));
        expect(other.status).toBe(404);
        expect(
          yield* Schema.decodeEffect(Schema.fromJsonString(Refusal))(other.body),
        ).toMatchObject({
          _tag: 'FilmUnknown',
          film: 'g',
          known: ['f'],
        });
        expect((yield* answer(get('/lab/g/check'))).status).toBe(404);
        expect((yield* answer(post('/lab/g/undo', '{}'))).status).toBe(404);
        expect((yield* answer(get('/lab/g/studio/beats'))).status).toBe(404);
        // A page from before the film was on the wire: no route takes it.
        expect((yield* answer(get('/lab/notes'))).status).toBe(404);
        // Nothing was written; the bound film still answers.
        const listed = yield* Effect.promise(() =>
          lab(get('/lab/f/notes'), bound).then((r) => r.json()),
        );
        expect((yield* Schema.decodeUnknownEffect(NotesFile)(listed)).notes).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(labLayer(files()))),
  );

  it.effect('every route the lab API declares answers a foreign Host 403, and runs nothing', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler('f');
      const routes = routesOf(LabHttpApi);
      expect(routes.length).toBeGreaterThan(15);
      for (const request of foreignRequests(routes, 'http://127.0.0.1:4401', 'f')) {
        const res = yield* Effect.promise(() => lab(request, bound));
        const refusal = yield* Effect.promise(() => res.json());
        const route = `${request.method} ${new URL(request.url).pathname}`;
        expect([route, res.status, refusal._tag]).toEqual([route, 403, 'RequestRefused']);
      }
      const listed = yield* Effect.promise(() =>
        lab(get('/lab/f/notes'), bound).then((r) => r.json()),
      );
      expect((yield* Schema.decodeUnknownEffect(NotesFile)(listed)).notes).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(labLayer(files()))),
  );

  it.effect('refuses a write from another page, a body that is not JSON, and a foreign Host', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler('f');
      const status = (req: Request) => Effect.promise(() => lab(req, bound).then((r) => r.status));
      // Another page the user has open (CSRF): its Origin is not the lab's.
      const foreign = { origin: 'http://evil.example' };
      expect(yield* status(post('/lab/f/notes', draft, foreign))).toBe(403);
      // A simple cross-site form post: text/plain needs no preflight, so it is refused as such.
      const plain = { 'content-type': 'text/plain' };
      expect(yield* status(post('/lab/f/notes', draft, plain))).toBe(415);
      expect(yield* status(post('/lab/f/notes/n1/resolve', '{}', plain))).toBe(415);
      // DNS rebinding: the page's own origin, but a Host that is not the bound host:port.
      const rebound = { host: 'evil.example:4401', origin: 'http://evil.example:4401' };
      expect(yield* status(post('/lab/f/notes', draft, rebound))).toBe(403);
      expect(yield* status(get('/lab/f/notes', { host: 'evil.example:4401' }))).toBe(403);
      // A cross-site GET (an <img> on another page) does not start a check.
      expect(yield* status(get('/lab/f/check', { 'sec-fetch-site': 'cross-site' }))).toBe(403);
      // Nothing was written.
      const listed = yield* Effect.promise(() =>
        lab(get('/lab/f/notes'), bound).then((r) => r.json()),
      );
      expect((yield* Schema.decodeUnknownEffect(NotesFile)(listed)).notes).toEqual([]);
      // The lab's own page, by either name for the loopback host, still writes.
      for (const origin of ['http://127.0.0.1:4401', 'http://localhost:4401'])
        expect(yield* status(post('/lab/f/notes', draft, { origin }))).toBe(200);
      expect(
        yield* status(
          get('/lab/f/notes', { host: 'localhost:4401', 'sec-fetch-site': 'same-origin' }),
        ),
      ).toBe(200);
    }).pipe(Effect.scoped, Effect.provide(labLayer(files()))),
  );
});
