// The lab's routes as the page calls them: a note posted with its still is
// listed and served, a wait hands back the change, a user reply reopens the
// thread, and a bad body or an unknown note answers with its status. And the
// lab never imports a film: no module its handler runs reaches a loader.

import { describe, expect, it } from 'effect-bun-test';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { Base64 } from 'effect/encoding';
import {
  FetchHttpClient,
  HttpBody,
  HttpClient,
  HttpPlatform,
  HttpServerResponse,
} from 'effect/http';
import { parseSync } from 'oxc-parser';
import {
  LabHttpApi,
  Places,
  Refusal,
  ToolFailure,
  labUrls,
  reviewFileUrl,
  routesOf,
} from '../core/api.ts';
import { NotesFile, NotesWait } from '../core/schema.ts';
import { ContentStore } from './content-store.ts';
import { labHandler, labLink } from './lab.ts';
import { LAB_IDLE_SECONDS, MAX_REQUEST_BODY, labServer, serveLab } from './api-server.ts';
import { STUDIO_IMPORT_WAIT_S, STUDIO_MAX_BODY } from '../core/studio.ts';
import { FilmFolder } from './film-repo.ts';
import { LabPage } from './lab-page.ts';
import { NotesStore } from './notes-store.ts';
import { PageReads } from './page-render.ts';
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

/**
 * Pages that read film `f`'s notes as a render does (`PageReads`) and are
 * answered what they read: its status and its body.
 */
const readingPages = Layer.effect(
  LabPage,
  Effect.map(LabPage, (echo) =>
    LabPage.of({
      ...echo,
      answer: Effect.gen(function* () {
        const { read } = yield* PageReads;
        const response = yield* read(labUrls.notes.list({ params: { film: 'f' } }));
        const body = yield* Effect.promise(() => response.text());
        return HttpServerResponse.text(`${response.status} ${body}`);
      }),
    }),
  ),
).pipe(Layer.provideMerge(echoPages));

const labLayer = (store: Map<string, Uint8Array>, pages = echoPages) =>
  Layer.mergeAll(
    NotesStore.layer,
    FilmFolder.layer('/films'),
    noSource,
    noStudio,
    noReview,
    pages,
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
  it.effect(
    "a page's render reads the API through the lab's own gate and routes, at the page's Host",
    () =>
      Effect.gen(function* () {
        const lab = yield* labHandler(LOOPBACK);
        yield* Effect.promise(() =>
          lab(post(labUrls.notes.add({ params: { film: 'f' } }), draft), bound),
        );
        const page = yield* Effect.promise(() => lab(get('/'), bound).then((r) => r.text()));
        expect(page).toMatch(/^200 \{/);
        expect(page).toContain('"id":"n1"');
      }).pipe(Effect.scoped, Effect.provide(labLayer(files(), readingPages))),
  );

  it.effect('a posted note is listed, its still served, and a wait returns it', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler(LOOPBACK);
      const posted = yield* Effect.promise(() =>
        lab(post(labUrls.notes.add({ params: { film: 'f' } }), draft), bound),
      );
      expect(posted.status).toBe(200);
      const listed = yield* Effect.promise(() =>
        lab(get(labUrls.notes.list({ params: { film: 'f' } })), bound).then((r) => r.json()),
      );
      const file = yield* Schema.decodeUnknownEffect(NotesFile)(listed);
      expect(file.notes.map((n) => [n.id, n.scene, n.cue?.name, n.still])).toEqual([
        ['n1', 'hand', 'topple', 'n1.png'],
      ]);
      const still = yield* Effect.promise(() =>
        lab(get(labUrls.notes.still({ params: { film: 'f', name: 'n1.png' } })), bound),
      );
      expect(still.headers.get('content-type')).toBe('image/png');
      expect(new Uint8Array(yield* Effect.promise(() => still.arrayBuffer()))).toEqual(png);
      // Served as a file: by byte ranges, and kept by the browser (a still never changes).
      const part = yield* Effect.promise(() =>
        lab(
          get(labUrls.notes.still({ params: { film: 'f', name: 'n1.png' } }), {
            range: 'bytes=0-1',
          }),
          bound,
        ),
      );
      expect([part.status, part.headers.get('cache-control')]).toEqual([206, 'max-age=86400']);
      expect(new Uint8Array(yield* Effect.promise(() => part.arrayBuffer()))).toEqual(
        png.slice(0, 2),
      );
      const waited = yield* Effect.promise(() =>
        lab(
          get(labUrls.notes.wait({ params: { film: 'f' }, query: { since: 0, timeout: 1 } })),
          bound,
        ).then((r) => r.json()),
      );
      const wait = yield* Schema.decodeUnknownEffect(NotesWait)(waited);
      expect(wait.events.map((e) => e._tag)).toEqual(['NoteAdded']);
      expect(wait.cursor).toBe(1);
    }).pipe(Effect.scoped, Effect.provide(labLayer(files()))),
  );

  it.effect('a user reply reopens the note; resolve closes it', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler(LOOPBACK);
      yield* Effect.promise(() =>
        lab(post(labUrls.notes.add({ params: { film: 'f' } }), draft), bound),
      );
      const replied = yield* Effect.promise(() =>
        lab(
          post(labUrls.notes.reply({ params: { film: 'f', id: 'n1' } }), '{"text":"lower still"}'),
          bound,
        ).then((r) => r.json()),
      );
      expect(replied).toMatchObject({
        status: 'open',
        thread: [{ by: 'user', text: 'lower still' }],
      });
      const resolved = yield* Effect.promise(() =>
        lab(post(labUrls.notes.resolve({ params: { film: 'f', id: 'n1' } }), '{}'), bound).then(
          (r) => r.json(),
        ),
      );
      expect(resolved).toMatchObject({ status: 'resolved' });
    }).pipe(Effect.scoped, Effect.provide(labLayer(files()))),
  );

  it.effect('a bad body is a 400, an unknown note a 404, a path for a still a 404', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler(LOOPBACK);
      const status = (req: Request) => Effect.promise(() => lab(req, bound).then((r) => r.status));
      expect(
        yield* status(post(labUrls.notes.add({ params: { film: 'f' } }), '{"scene":"hand"}')),
      ).toBe(400);
      expect(
        yield* status(post(labUrls.notes.resolve({ params: { film: 'f', id: 'n9' } }), '{}')),
      ).toBe(404);
      expect(yield* status(get('/api/films/f/stills/..%2Fnotes.json'))).toBe(404);
    }).pipe(Effect.scoped, Effect.provide(labLayer(files()))),
  );

  it.effect(
    'a look reaches the easel: its failure answers with its status and tag, a bad body 400',
    () =>
      Effect.gen(function* () {
        const lab = yield* labHandler(LOOPBACK);
        const url = labUrls.looks.take({ params: { film: 'f' } });
        const look =
          '{"scene":"roof","at":["1"],"view":{"mode":"plain","captions":false,"format":"image/png"}}';
        const failed = yield* Effect.promise(() => lab(post(url, look), bound));
        expect(failed.status).toBe(502);
        const body = yield* Effect.promise(() => failed.text());
        expect(yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(body)).toEqual({
          _tag: 'LookFailed',
          reason: 'no easel in this test',
        });
        // The one shape a tool decodes, as `film look --json` prints it too.
        expect(yield* Schema.decodeEffect(Schema.fromJsonString(ToolFailure))(body)).toMatchObject({
          _tag: 'LookFailed',
        });
        const bad = yield* Effect.promise(() => lab(post(url, '{"scene":"roof","at":[]}'), bound));
        expect(bad.status).toBe(400);
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
        const other = yield* answer(post(labUrls.notes.add({ params: { film: 'g' } }), draft));
        expect(other.status).toBe(404);
        expect(
          yield* Schema.decodeEffect(Schema.fromJsonString(Refusal))(other.body),
        ).toMatchObject({
          _tag: 'FilmUnknown',
          film: 'g',
          known: ['f'],
        });
        expect((yield* answer(get(labUrls.steps.check({ params: { film: 'g' } })))).status).toBe(
          404,
        );
        expect(
          (yield* answer(post(labUrls.steps.undo({ params: { film: 'g' } }), '{}'))).status,
        ).toBe(404);
        expect((yield* answer(get(labUrls.studio.beats({ params: { film: 'g' } })))).status).toBe(
          404,
        );
        // A page from before the film was on the wire: no route takes it, and the answer says so.
        const unrouted = yield* answer(get('/api/films/f/nope'));
        expect(unrouted.status).toBe(404);
        expect(
          yield* Schema.decodeEffect(Schema.fromJsonString(Refusal))(unrouted.body),
        ).toMatchObject({ _tag: 'RouteUnknown', path: '/api/films/f/nope' });
        // Nothing was written; the app's film still answers.
        const listed = yield* Effect.promise(() =>
          lab(get(labUrls.notes.list({ params: { film: 'f' } })), bound).then((r) => r.json()),
        );
        expect((yield* Schema.decodeUnknownEffect(NotesFile)(listed)).notes).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(labLayer(files()))),
  );

  it.effect(
    'the gate: every route and every kind of page path, against every request it refuses, and what it lets in',
    () =>
      Effect.gen(function* () {
        const lab = yield* labHandler(LOOPBACK);
        const answer = (request: Request) =>
          Effect.gen(function* () {
            const res = yield* Effect.promise(() => lab(request, bound));
            const body = yield* Effect.promise(() => res.text());
            const tag = /"_tag":"(\w+)"/.exec(body)?.[1] ?? '';
            return [res.status, tag] as const;
          });
        /** `request`'s row: what it asks, and the status and refusal it gets. */
        const row = (request: Request) => {
          const url = new URL(request.url);
          return Effect.map(
            answer(request),
            ([status, tag]) =>
              [`${request.method} ${url.pathname}${url.search}`, status, tag] as const,
          );
        };
        const routes = routesOf(LabHttpApi);
        expect(routes.length).toBeGreaterThan(15);
        const foreign = { host: 'evil.example:4401' };
        const crossSite = { 'sec-fetch-site': 'cross-site' };
        const navigation = {
          'sec-fetch-site': 'cross-site',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-dest': 'document',
        };
        const json = (path: string, method: string, headers: Record<string, string>) => {
          const init = { method, headers: { 'content-type': 'application/json', ...headers } };
          if (method === 'GET') return new Request(at(path), init);
          return new Request(at(path), { ...init, body: '{}' });
        };
        // Every route: a foreign Host, a cross-site request (a link opened on another
        // site included: a navigation reaches pages only), and for a write, a body
        // that is not JSON and an Origin that is not the lab's.
        for (const route of foreignRequests(routes, 'http://127.0.0.1:4401', 'f')) {
          const path = new URL(route.url).pathname;
          const refused = [`${route.method} ${path}`, 403, 'RequestRefused'] as const;
          expect(yield* row(json(path, route.method, foreign))).toEqual(refused);
          expect(yield* row(json(path, route.method, crossSite))).toEqual(refused);
          expect(yield* row(json(path, route.method, navigation))).toEqual(refused);
          if (route.method === 'GET') continue;
          for (const type of [
            'text/plain',
            'application/x-www-form-urlencoded',
            'multipart/form-data; boundary=x',
          ])
            expect(yield* row(post(path, '{}', { 'content-type': type }))).toEqual([
              `${route.method} ${path}`,
              415,
              'WriteNotJson',
            ]);
          expect(yield* row(post(path, '{}', { origin: 'http://evil.example' }))).toEqual(refused);
        }
        // The pages: a foreign Host never; a link opened on another site, yes (GET or
        // HEAD), but none of a page's files; a page is read, never written.
        // Every place's path (its film `f`, each other part `x`), and old links
        // the pages answer with a redirect to their place.
        const pages = [
          ...Object.values(Places).map((place) =>
            place.pattern.replace(':film', 'f').replaceAll(/:\w+/g, 'x'),
          ),
          '/lab?film=f',
          '/player?film=f&lookbook',
          '/?project=f',
        ];
        const files = ['/chunk-a1.js', '/films/f/narration/s1.mp3', '/nothing'];
        for (const path of [...pages, ...files]) {
          expect(yield* row(get(path, foreign))).toEqual([`GET ${path}`, 403, 'RequestRefused']);
          expect(
            yield* row(get(path, { 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'script' })),
          ).toEqual([`GET ${path}`, 403, 'RequestRefused']);
          expect(yield* row(json(path, 'POST', {}))).toEqual([`POST ${path}`, 405, '']);
        }
        for (const path of pages) {
          expect(yield* row(get(path, navigation))).toEqual([`GET ${path}`, 200, '']);
          expect(
            yield* row(new Request(at(path), { method: 'HEAD', headers: navigation })),
          ).toEqual([`HEAD ${path}`, 200, '']);
        }
        for (const path of files)
          expect(yield* row(get(path, navigation))).toEqual([`GET ${path}`, 403, 'RequestRefused']);
        // A write past the body limit is refused as it streams.
        expect(
          yield* row(
            post(labUrls.notes.add({ params: { film: 'f' } }), 'x'.repeat(STUDIO_MAX_BODY + 1)),
          ),
        ).toEqual([`POST ${labUrls.notes.add({ params: { film: 'f' } })}`, 413, 'BodyTooLarge']);
        // DNS rebinding: the page's own origin, but a Host that is not the bound host:port.
        const rebound = { host: 'evil.example:4401', origin: 'http://evil.example:4401' };
        expect(
          (yield* row(post(labUrls.notes.add({ params: { film: 'f' } }), draft, rebound)))[1],
        ).toBe(403);
        // Nothing was written.
        const listed = yield* Effect.promise(() =>
          lab(get(labUrls.notes.list({ params: { film: 'f' } })), bound).then((r) => r.json()),
        );
        expect((yield* Schema.decodeUnknownEffect(NotesFile)(listed)).notes).toEqual([]);
        // The lab's own page, by either name for the loopback host, still writes and reads.
        for (const origin of ['http://127.0.0.1:4401', 'http://localhost:4401'])
          expect(
            (yield* row(post(labUrls.notes.add({ params: { film: 'f' } }), draft, { origin })))[1],
          ).toBe(200);
        expect(
          (yield* row(
            get(labUrls.notes.list({ params: { film: 'f' } }), {
              host: 'localhost:4401',
              'sec-fetch-site': 'same-origin',
            }),
          ))[1],
        ).toBe(200);
      }).pipe(Effect.scoped, Effect.provide(labLayer(files()))),
  );

  it.effect('the real server answers only behind the gate: no route of Bun answers first', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler(LOOPBACK);
      const server = yield* Layer.build(labServer({ hostname: '127.0.0.1', port: 0 }));
      const url = yield* serveLab(lab).pipe(Effect.provideContext(server));
      const client = yield* HttpClient.HttpClient;
      const status = (path: string, headers: Record<string, string>) =>
        Effect.map(
          Effect.orDie(client.get(new URL(path, url), { headers })),
          (response) => response.status,
        );
      for (const path of [
        '/',
        '/lab',
        '/films/f/lab/hand',
        '/films/f/narration/s1.mp3',
        '/chunk-a1.js',
      ])
        expect([path, yield* status(path, { host: 'evil.example' })]).toEqual([path, 403]);
      expect(yield* status('/', {})).toBe(200);
      expect(yield* status(labUrls.notes.list({ params: { film: 'f' } }), {})).toBe(200);
      // A take's import answers inside the studio's wait, which the server's idle limit outlasts.
      expect(LAB_IDLE_SECONDS).toBeGreaterThan(STUDIO_IMPORT_WAIT_S);
    }).pipe(Effect.scoped, Effect.provide([labLayer(files()), FetchHttpClient.layer])),
  );

  it.effect(
    "a body over the gate's limit is the gate's 413; one over Bun's, Bun's own, before the gate",
    () =>
      Effect.gen(function* () {
        const lab = yield* labHandler(LOOPBACK);
        const server = yield* Layer.build(labServer({ hostname: '127.0.0.1', port: 0 }));
        const url = yield* serveLab(lab).pipe(Effect.provideContext(server));
        const client = yield* HttpClient.HttpClient;
        const notes = new URL(labUrls.notes.add({ params: { film: 'f' } }), url);
        const sent = (bytes: number) =>
          Effect.flatMap(
            Effect.orDie(
              client.post(notes, {
                body: HttpBody.uint8Array(new Uint8Array(bytes), 'application/json'),
              }),
            ),
            (response) =>
              Effect.map(Effect.orDie(response.text), (text) => [response.status, text] as const),
          );
        // Under Bun's limit the gate counts the body, refuses it and logs it (`api.request.refused`).
        const [gateStatus, gateText] = yield* sent(STUDIO_MAX_BODY + 1);
        expect(gateStatus).toBe(413);
        expect(gateText).toContain('BodyTooLarge');
        // Past it Bun answers 413 itself: its handler is never called, so no line can say so.
        const [bunStatus, bunText] = yield* sent(MAX_REQUEST_BODY + 1);
        expect(bunStatus).toBe(413);
        expect(bunText).not.toContain('BodyTooLarge');
      }).pipe(Effect.scoped, Effect.provide([labLayer(files()), FetchHttpClient.layer])),
  );

  it.effect('the link the lab hands out: its first host over HTTPS, else where it is bound', () =>
    Effect.sync(() => {
      expect(labLink('http://0.0.0.0:8229/', { hosts: ['box.example:8229', 'other:8229'] })).toBe(
        'https://box.example:8229/',
      );
      expect(labLink('http://127.0.0.1:8229/', { hosts: [] })).toBe('http://127.0.0.1:8229/');
    }),
  );

  it.effect("the API's paths, as the wire has them", () =>
    Effect.sync(() => {
      expect(labUrls.notes.list({ params: { film: 'f' } })).toBe('/api/films/f/notes');
      expect(labUrls.scenes.cue({ params: { film: 'f', scene: 's', cue: 'c' } })).toBe(
        '/api/films/f/scenes/s/cues/c',
      );
      expect(labUrls.choices.films()).toBe('/api/films');
      expect(labUrls.project.get({ params: { film: 'f' }, query: {} })).toBe(
        '/api/films/f/project',
      );
      expect(labUrls.review.index({ query: {} })).toBe('/api/review/index');
      expect(labUrls.page.wait({ query: { since: 3 } })).toBe('/api/review/build?since=3');
      expect(reviewFileUrl('out/a b.mp4')).toBe('/api/review/files/out/a%20b.mp4');
    }),
  );
});
