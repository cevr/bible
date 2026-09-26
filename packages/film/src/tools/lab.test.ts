// The lab's routes as the page calls them: a note posted with its still is
// listed and served, a wait hands back the change, a user reply reopens the
// thread, and a bad body or an unknown note answers with its status.

import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Effect, Encoding, Layer, Path, Schema } from 'effect';
import { NotesFile, NotesWait } from '../core/schema.ts';
import { ContentStore } from './content-store.ts';
import { labHandler } from './lab.ts';
import { FilmRepo } from './film-repo.ts';
import { NotesStore } from './notes-store.ts';
import { SceneHead } from './scene-head.ts';
import { SceneSources } from './scene-sources.ts';
import { SceneWriter } from './scene-writer.ts';
import { StaticCheck } from './static-check.ts';
import { memoryFileSystem, text } from './testing.ts';

const files = () => new Map<string, Uint8Array>();

/** The scene-source routes are not called here: their services only have to exist. */
const unused = Effect.die('not used by the notes routes');
const noSource = Layer.mergeAll(
  Layer.succeed(
    SceneSources,
    SceneSources.of({
      locate: () => unused,
      site: () => unused,
      writable: () => unused,
      editable: () => unused,
    }),
  ),
  Layer.succeed(
    SceneWriter,
    SceneWriter.of({
      setCue: () => unused,
      setKnob: () => unused,
      undo: unused,
      last: unused,
    }),
  ),
  Layer.succeed(StaticCheck, StaticCheck.of({ run: () => unused })),
  Layer.succeed(SceneHead, SceneHead.of({ head: () => unused })),
);

const labLayer = (store: Map<string, Uint8Array>) =>
  Layer.mergeAll(NotesStore.layer, FilmRepo.layer('/films'), noSource).pipe(
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

const draft = `{"scene":"hand","T":230.38,"frame":6911,"cue":{"name":"topple","edge":"end"},"box":{"x":860,"y":640,"w":200,"h":120},"text":"too low","still":"${Encoding.encodeBase64(png)}"}`;

describe('lab routes', () => {
  it.effect('a posted note is listed, its still served, and a wait returns it', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler('f');
      const posted = yield* Effect.promise(() => lab(post('/lab/notes', draft), bound));
      expect(posted.status).toBe(200);
      const listed = yield* Effect.promise(() =>
        lab(get('/lab/notes'), bound).then((r) => r.json()),
      );
      const file = yield* Schema.decodeUnknownEffect(NotesFile)(listed);
      expect(file.notes.map((n) => [n.id, n.scene, n.cue?.name, n.still])).toEqual([
        ['n1', 'hand', 'topple', 'n1.png'],
      ]);
      const still = yield* Effect.promise(() => lab(get('/lab/stills/n1.png'), bound));
      expect(still.headers.get('content-type')).toBe('image/png');
      expect(new Uint8Array(yield* Effect.promise(() => still.arrayBuffer()))).toEqual(png);
      const waited = yield* Effect.promise(() =>
        lab(get('/lab/notes/wait?since=0&timeout=1'), bound).then((r) => r.json()),
      );
      const wait = yield* Schema.decodeUnknownEffect(NotesWait)(waited);
      expect(wait.events.map((e) => e._tag)).toEqual(['NoteAdded']);
      expect(wait.cursor).toBe(1);
    }).pipe(Effect.scoped, Effect.provide(labLayer(files()))),
  );

  it.effect('a user reply reopens the note; resolve closes it', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler('f');
      yield* Effect.promise(() => lab(post('/lab/notes', draft), bound));
      const replied = yield* Effect.promise(() =>
        lab(post('/lab/notes/n1/reply', '{"text":"lower still"}'), bound).then((r) => r.json()),
      );
      expect(replied).toMatchObject({
        status: 'open',
        thread: [{ by: 'user', text: 'lower still' }],
      });
      const resolved = yield* Effect.promise(() =>
        lab(post('/lab/notes/n1/resolve', '{}'), bound).then((r) => r.json()),
      );
      expect(resolved).toMatchObject({ status: 'resolved' });
    }).pipe(Effect.scoped, Effect.provide(labLayer(files()))),
  );

  it.effect('a bad body is a 400, an unknown note a 404, a path for a still a 404', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler('f');
      const status = (req: Request) => Effect.promise(() => lab(req, bound).then((r) => r.status));
      expect(yield* status(post('/lab/notes', '{"scene":"hand"}'))).toBe(400);
      expect(yield* status(post('/lab/notes/n9/resolve', '{}'))).toBe(404);
      expect(yield* status(get('/lab/stills/..%2Fnotes.json'))).toBe(404);
    }).pipe(Effect.scoped, Effect.provide(labLayer(files()))),
  );

  it.effect('refuses a write from another page, a body that is not JSON, and a foreign Host', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler('f');
      const status = (req: Request) => Effect.promise(() => lab(req, bound).then((r) => r.status));
      // Another page the user has open (CSRF): its Origin is not the lab's.
      const foreign = { origin: 'http://evil.example' };
      expect(yield* status(post('/lab/notes', draft, foreign))).toBe(403);
      // A simple cross-site form post: text/plain needs no preflight, so it is refused as such.
      const plain = { 'content-type': 'text/plain' };
      expect(yield* status(post('/lab/notes', draft, plain))).toBe(415);
      expect(yield* status(post('/lab/notes/n1/resolve', '{}', plain))).toBe(415);
      // DNS rebinding: the page's own origin, but a Host that is not the bound host:port.
      const rebound = { host: 'evil.example:4401', origin: 'http://evil.example:4401' };
      expect(yield* status(post('/lab/notes', draft, rebound))).toBe(403);
      expect(yield* status(get('/lab/notes', { host: 'evil.example:4401' }))).toBe(403);
      // A cross-site GET (an <img> on another page) does not start a check.
      expect(yield* status(get('/lab/check', { 'sec-fetch-site': 'cross-site' }))).toBe(403);
      // Nothing was written.
      const listed = yield* Effect.promise(() =>
        lab(get('/lab/notes'), bound).then((r) => r.json()),
      );
      expect((yield* Schema.decodeUnknownEffect(NotesFile)(listed)).notes).toEqual([]);
      // The lab's own page, by either name for the loopback host, still writes.
      for (const origin of ['http://127.0.0.1:4401', 'http://localhost:4401'])
        expect(yield* status(post('/lab/notes', draft, { origin }))).toBe(200);
      expect(
        yield* status(
          get('/lab/notes', { host: 'localhost:4401', 'sec-fetch-site': 'same-origin' }),
        ),
      ).toBe(200);
    }).pipe(Effect.scoped, Effect.provide(labLayer(files()))),
  );
});
