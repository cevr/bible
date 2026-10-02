// The lab's routes as the page calls them: a note posted with its still is
// listed and served, a wait hands back the change, a user reply reopens the
// thread, and a bad body or an unknown note answers with its status. And the
// lab never imports a film: no module its handler runs reaches a loader.

import { describe, expect, it } from 'effect-bun-test';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { Base64 } from 'effect/encoding';
import { HttpPlatform } from 'effect/http';
import { parseSync } from 'oxc-parser';
import { LabHttpApi, Refusal, routesOf } from '../core/api.ts';
import { NotesFile, NotesWait } from '../core/schema.ts';
import { ContentStore } from './content-store.ts';
import { labHandler } from './lab.ts';
import { FilmFolder } from './film-repo.ts';
import { NotesStore } from './notes-store.ts';
import {
  echoPages,
  foreignRequests,
  freshFilm,
  memoryFileSystem,
  noReview,
  noSource,
  noStudio,
  text,
} from './testing.ts';

/** The films folder with one film, `f`: a folder with its scenes' index. */
const files = () =>
  new Map<string, Uint8Array>([['/films/f/scenes/index.ts', text('export {};\n')]]);

const labLayer = (store: Map<string, Uint8Array>) =>
  Layer.mergeAll(
    NotesStore.layer,
    FilmFolder.layer('/films'),
    noSource,
    noStudio,
    noReview,
    echoPages,
    freshFilm({}),
    HttpPlatform.layer,
  ).pipe(
    Layer.provideMerge(ContentStore.layer),
    Layer.provideMerge([
      memoryFileSystem(store),
      Path.layer,
      ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_LAB: '/lab' })),
    ]),
  );

const png = text('frame');

/** The lab told no hosts: loopback alone. */
const LOOPBACK = { hosts: [] };

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

/** The names that import a film's modules, or the app's sound library, in the process that calls them. */
const LOADERS: ReadonlySet<string> = new Set(['importFilmModule', 'libraryModule']);

/**
 * Where the loaders are declared, beside the services that call them
 * (`FilmRepo`): `lab-context.types.ts` holds those services out of the lab.
 */
const DECLARER = 'film-repo.ts';

/** How the parser reads `file`: JSX only in a `.tsx`. */
const langOf = (file: string): 'ts' | 'tsx' => {
  if (file.endsWith('.tsx')) return 'tsx';
  return 'ts';
};

/** An `import(…)`'s specifier when it is a string literal (a module of the framework's own), else none. */
const literalOf = (source: string, request: { readonly start: number; readonly end: number }) =>
  Option.fromNullishOr(/^['"]([^'"]*)['"]$/.exec(source.slice(request.start, request.end))?.[1]);

/**
 * Each module `labHandler` runs, followed from `lab.ts` through its relative
 * value imports, re-exports and literal `import('./…')`s (an `import type` is
 * gone at run time), with the loaders it imports and each `import()` of a
 * path it computes (what a loader is). A loader reached through a function
 * is in this list, where the typed guard sees only services.
 */
const loadersReached = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const reached = new Map<string, ReadonlyArray<string>>();
  const next = [path.join(import.meta.dir, 'lab.ts')];
  // A for-of over an array visits what is pushed onto it while it runs.
  for (const file of next) {
    if (reached.has(file)) continue;
    const source = yield* fs.readFileString(file);
    const { module } = parseSync(file, source, { lang: langOf(file), sourceType: 'module' });
    const dynamic = module.dynamicImports.map((d) => literalOf(source, d.moduleRequest));
    const takes = [
      ...dynamic.flatMap((from) =>
        Option.toArray(Option.map(from, (f) => ({ from: f, names: ['*'] }))),
      ),
      ...module.staticImports.map((i) => ({
        from: i.moduleRequest.value,
        names: i.entries.filter((e) => !e.isType).map((e) => e.importName.name ?? ''),
      })),
      ...module.staticExports
        .flatMap((e) => e.entries)
        .filter((e) => !e.isType)
        .flatMap((e) =>
          Option.toArray(
            Option.map(Option.fromNullishOr(e.moduleRequest), (request) => ({
              from: request.value,
              names: [e.importName.name ?? ''],
            })),
          ),
        ),
    ].filter((take) => take.names.length > 0);
    for (const take of takes)
      if (take.from.startsWith('.')) next.push(path.resolve(path.dirname(file), take.from));
    const loaders = takes.flatMap((take) => take.names.filter((name) => LOADERS.has(name)));
    const computed = dynamic.filter(Option.isNone).map(() => 'import(<computed>)');
    reached.set(file, [...loaders, ...computed]);
  }
  return new Map(
    [...reached].map(([file, found]) => [path.relative(import.meta.dir, file), found]),
  );
});

const draft = `{"scene":"hand","T":230.38,"frame":6911,"cue":{"name":"topple","edge":"end"},"box":{"x":860,"y":640,"w":200,"h":120},"text":"too low","still":"${Base64.encode(png)}"}`;

describe('the lab loads no film', () => {
  // The lab runs for days and Bun keeps a module as it first imported it: a
  // module the lab runs that imports a film reads it as it was at the lab's
  // start. Each read of a film's modules runs fresh (`FreshFilm`).
  it.effect('no module the lab runs imports a loader or a computed import()', () =>
    Effect.gen(function* () {
      const reached = yield* loadersReached;
      expect(reached.has(DECLARER)).toBe(true);
      const loading = [...reached].filter(([file, found]) => file !== DECLARER && found.length);
      expect(loading).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});

describe('lab routes', () => {
  it.effect('a posted note is listed, its still served, and a wait returns it', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler(LOOPBACK);
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
      const lab = yield* labHandler(LOOPBACK);
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
      const lab = yield* labHandler(LOOPBACK);
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
        const lab = yield* labHandler(LOOPBACK);
        const answer = (req: Request) =>
          Effect.gen(function* () {
            const res = yield* Effect.promise(() => lab(req, bound));
            return { status: res.status, body: yield* Effect.promise(() => res.text()) };
          });
        // A page for film g, which the app does not have.
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
        // A page from before the film was on the wire: no route takes it, and the answer says so.
        const unrouted = yield* answer(get('/lab/notes'));
        expect(unrouted.status).toBe(404);
        expect(
          yield* Schema.decodeEffect(Schema.fromJsonString(Refusal))(unrouted.body),
        ).toMatchObject({ _tag: 'RouteUnknown', path: '/lab/notes' });
        // Nothing was written; the app's film still answers.
        const listed = yield* Effect.promise(() =>
          lab(get('/lab/f/notes'), bound).then((r) => r.json()),
        );
        expect((yield* Schema.decodeUnknownEffect(NotesFile)(listed)).notes).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(labLayer(files()))),
  );

  it.effect('every route the lab API declares answers a foreign Host 403, and runs nothing', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler(LOOPBACK);
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
      const lab = yield* labHandler(LOOPBACK);
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
