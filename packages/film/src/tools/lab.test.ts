// The lab's routes as the page calls them: a note posted with its still is
// listed and served, a wait hands back the change, a user reply reopens the
// thread, and a bad body or an unknown note answers with its status. A page
// is sent compressed, a streamed one chunk by chunk. A client that leaves
// mid-build or mid-render, on the real server, leaves the watches whole and
// stops the render's reads. And the lab never imports a film: no module its
// handler runs reaches a loader.

import { describe, expect, it } from 'effect-bun-test';
import { BunServices } from '@effect/platform-bun';
import {
  Array as Arr,
  ConfigProvider,
  Context,
  Deferred,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Logger,
  Option,
  Order,
  Path,
  PubSub,
  Ref,
  Schedule,
  Schema,
  Stream,
} from 'effect';
import { Base64 } from 'effect/encoding';
import {
  FetchHttpClient,
  HttpBody,
  HttpClient,
  HttpPlatform,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http';
import { brotliDecompressSync } from 'node:zlib';
import { parseSync } from 'oxc-parser';
import { LabHttpApi, Places, Refusal, ToolFailure, labUrls, routesOf } from '../core/api.ts';
import { NotesFile, NotesWait } from '../core/schema.ts';
import { ContentStore } from './content-store.ts';
import { labHandler, labLink } from './lab.ts';
import {
  type BesideRoutes,
  LAB_IDLE_SECONDS,
  MAX_REQUEST_BODY,
  PageReads,
  labServer,
  serveLab,
} from './api-server.ts';
import { STUDIO_IMPORT_WAIT_S, STUDIO_MAX_BODY } from '../core/studio.ts';
import { FilmFolder } from './film-repo.ts';
import { LabPage, type LabPageSpec, PageBundler } from './lab-page.ts';
import { NotesStore } from './notes-store.ts';
import { PageRenderer } from './page-render.ts';
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

/**
 * Pages as a test asks them: one asked `?read=<path>` reads that path as a
 * render does and is answered its status and body; one asked `?vary=<v>` is
 * answered with that Vary, as a page that varies by more than its coding.
 */
const askedPages = Layer.effect(
  LabPage,
  Effect.map(LabPage, (echo) =>
    LabPage.of({
      ...echo,
      answer: Effect.gen(function* () {
        const query = new URL((yield* HttpServerRequest.HttpServerRequest).url, 'http://lab')
          .searchParams;
        const vary = Option.fromNullishOr(query.get('vary'));
        if (Option.isSome(vary))
          // Long enough to be compressed (a body under 1 KB is sent as it is).
          return HttpServerResponse.text('a page '.repeat(300), { headers: { vary: vary.value } });
        const { read } = yield* PageReads;
        const response = yield* read(query.get('read') ?? '');
        const body = yield* Effect.promise(() => response.text());
        return HttpServerResponse.text(`${response.status} ${body}`);
      }),
    }),
  ),
).pipe(Layer.provideMerge(echoPages));

/**
 * A path beside the API's routes that answers nothing: held until its
 * request is gone. Under the API's prefix, as a render reads nothing else.
 */
const HELD = '/api/held';

/** The held path's route: `asked` is done once it is asked, `ended` once its request is stopped. */
const heldRoute = (ended: Deferred.Deferred<void>, asked?: Deferred.Deferred<void>) =>
  HttpRouter.add(
    'GET',
    HELD,
    Effect.andThen(
      Effect.forEach(Option.toArray(Option.fromUndefinedOr(asked)), (a) =>
        Deferred.done(a, Exit.void),
      ),
      Effect.andThen(Effect.never, Effect.succeed(HttpServerResponse.empty())),
    ).pipe(Effect.onInterrupt(() => Deferred.done(ended, Exit.void))),
  );

/**
 * Pages whose render reads the held path and gives the read up after a
 * moment, as a render whose request is gone does: answered `gave up`.
 */
const givingUpPages = Layer.effect(
  LabPage,
  Effect.map(LabPage, (echo) =>
    LabPage.of({
      ...echo,
      answer: Effect.gen(function* () {
        const { read } = yield* PageReads;
        const got = yield* read(HELD).pipe(Effect.timeoutOption('50 millis'));
        return HttpServerResponse.text(
          Option.match(got, { onNone: () => 'gave up', onSome: () => 'read' }),
        );
      }),
    }),
  ),
).pipe(Layer.provideMerge(echoPages));

/** A server-rendered page's shell, sent at once. */
const SHELL = '<!doctype html><html><head></head><body><main>the shell</main>';

/** The rest of the page, sent once its render ends. */
const REST = '<p>the rest</p></body></html>';

/** Pages streamed as a server render streams them: the shell, then the rest once `ended` is done. */
const streamingPages = (ended: Deferred.Deferred<void>) =>
  Layer.effect(
    LabPage,
    Effect.map(LabPage, (echo) =>
      LabPage.of({
        ...echo,
        answer: Effect.succeed(
          HttpServerResponse.stream(
            Stream.encodeText(
              Stream.concat(
                Stream.succeed(SHELL),
                Stream.fromEffect(Effect.as(Deferred.await(ended), REST)),
              ),
            ),
            { contentType: 'text/html; charset=utf-8' },
          ),
        ),
      }),
    ),
  ).pipe(Layer.provideMerge(echoPages));

/** A reader of a gzipped response's body as text, as it arrives. */
const gunzipped = (response: Response) =>
  Option.match(Option.fromNullishOr(response.body), {
    onNone: () => new ReadableStream<string>().getReader(),
    onSome: (body) =>
      body
        .pipeThrough(new DecompressionStream('gzip'))
        .pipeThrough(new TextDecoderStream())
        .getReader(),
  });

/** What `reader` gives until it has `length` characters or ends. */
const readTo = (
  reader: ReadableStreamDefaultReader<string>,
  length: number,
  got = '',
): Effect.Effect<string> => {
  if (got.length >= length) return Effect.succeed(got);
  return Effect.flatMap(
    Effect.promise(() => reader.read()),
    (read) => {
      if (read.done) return Effect.succeed(got);
      return readTo(reader, length, got + read.value);
    },
  );
};

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

/** A logger that keeps every line the lab logs in `lines`, and prints none. */
const loggedInto = (lines: Array<string>) =>
  Logger.layer([Logger.make(({ message }) => lines.push([message].flat().join(' ')))]);

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

/** The folder a build stops reading, then reads again (`drivenPages`). */
const DROPPED = '/app/b';

/** The sources a driven build reads beside its entries, one in each of two folders. */
const SOURCES = ['/app/a/x.ts', `${DROPPED}/y.ts`] as const;

/** What a test drives the app's pages by (`drivenPages`). */
interface DrivenService {
  /** `file` saved as `source`, and its folder's watch told. */
  readonly save: (file: string, source: string) => Effect.Effect<void>;
  /** The sources a build reads beside its entries. */
  readonly reads: Ref.Ref<ReadonlyArray<string>>;
  /** The folders whose watch runs now, sorted, once each watch. */
  readonly watched: Effect.Effect<ReadonlyArray<string>>;
  /** While true, the watch of `DROPPED` is done on `dropping` as it is let go and ends once `release` is. */
  readonly held: Ref.Ref<boolean>;
  readonly dropping: Deferred.Deferred<void>;
  readonly release: Deferred.Deferred<void>;
}

class Driven extends Context.Service<Driven, DrivenService>()(
  '@bible/film/tools/lab.test/Driven',
) {}

/**
 * The app's pages (`LabPage`, beside `echoPages`' easel) over files in
 * memory, built by the test bundler with the sources `Driven.reads` names
 * beside their entries (a server entry, `server`, for the review when
 * given), rendered by `renderer`, and watched by watches the test drives
 * (`Driven`).
 */
const drivenPages = (
  renderer: Layer.Layer<PageRenderer>,
  server: Option.Option<string> = Option.none(),
) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const page = (title: string) =>
        text(`<!doctype html><html><head><title>${title}</title></head><body></body></html>`);
      const files = new Map<string, Uint8Array>([
        ['/app/review.html', page('review')],
        ['/app/lab.html', page('lab')],
        ['/app/sub/player.html', page('player')],
        ...SOURCES.map((file) => [file, text('export {};\n')] as const),
        ...Option.toArray(
          Option.map(server, (code) => ['/app/review.server.js', text(code)] as const),
        ),
      ]);
      const spec: LabPageSpec = {
        pages: { review: '/app/review.html', lab: '/app/lab.html', player: '/app/sub/player.html' },
        servers: Option.match(server, {
          onNone: () => ({}),
          onSome: () => ({ review: '/app/review.server.js' }),
        }),
        films: '/app/films',
      };
      const saves = yield* PubSub.unbounded<string>();
      const reads = yield* Ref.make<ReadonlyArray<string>>(SOURCES);
      const live = yield* Ref.make<ReadonlyArray<string>>([]);
      const held = yield* Ref.make(false);
      const dropping = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const path = yield* Path.Path;
      const fileSystem = Layer.effect(
        FileSystem.FileSystem,
        Effect.map(FileSystem.FileSystem, (fs) =>
          FileSystem.FileSystem.of({
            ...fs,
            watch: (dir) =>
              Stream.unwrap(
                Effect.as(
                  Ref.update(live, (dirs) => [...dirs, dir]),
                  Stream.fromPubSub(saves).pipe(
                    Stream.filter((file) => path.dirname(file) === dir),
                    Stream.map((file): FileSystem.WatchEvent => ({
                      _tag: 'Update',
                      path: path.basename(file),
                    })),
                  ),
                ),
              ).pipe(
                Stream.ensuring(
                  Effect.gen(function* () {
                    yield* Ref.update(live, (dirs) => Arr.remove(dirs, dirs.indexOf(dir)));
                    if (dir !== DROPPED || !(yield* Ref.get(held))) return;
                    yield* Deferred.done(dropping, Exit.void);
                    yield* Deferred.await(release);
                  }),
                ),
              ),
          }),
        ),
      ).pipe(Layer.provide(memoryFileSystem(files)));
      const bundler = Layer.effect(
        PageBundler,
        Effect.map(PageBundler, (inner) =>
          PageBundler.of({
            bundle: (entries, root, how) =>
              Effect.flatMap(inner.bundle(entries, root, how), (made) =>
                Effect.map(Ref.get(reads), (more) => ({
                  ...made,
                  inputs: [...made.inputs, ...more],
                })),
              ),
          }),
        ),
      ).pipe(Layer.provide(PageBundler.layerTest));
      const save = (file: string, source: string) =>
        Effect.asVoid(
          Effect.andThen(
            Effect.sync(() => files.set(file, text(source))),
            PubSub.publish(saves, file),
          ),
        );
      const watched = Effect.map(Ref.get(live), (dirs) => Arr.sort(dirs, Order.String));
      return Layer.mergeAll(
        echoPages,
        LabPage.layer(spec).pipe(
          Layer.provide([bundler, renderer]),
          Layer.provide([fileSystem, Path.layer]),
        ),
        Layer.succeed(Driven, Driven.of({ save, reads, watched, held, dropping, release })),
      );
    }),
  ).pipe(Layer.provide(Path.layer));

/** The pages' build now, as a page another server served hears it at once. */
const buildNow = Effect.flatMap(LabPage, (page) =>
  page.wait({ since: 0, server: Option.some('another'), film: Option.none() }, 0),
);

/** A wait past the build now, once `change` is made: the build that heard it. */
const heardOf = <E, R>(change: Effect.Effect<void, E, R>) =>
  Effect.gen(function* () {
    const since = (yield* buildNow).build;
    yield* change;
    const page = yield* LabPage;
    return (yield* page.wait({ since, server: Option.none(), film: Option.none() }, '3 seconds'))
      .build;
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

  it.effect(
    "a page's render reads the API alone: a page, a script or a file is a 404 RouteUnknown, never asked",
    () =>
      Effect.gen(function* () {
        const lab = yield* labHandler(LOOPBACK);
        for (const path of ['/films/f/play', '/chunk-a1.js', '/films/f/narration/s1.mp3']) {
          const asked = `/?read=${encodeURIComponent(path)}`;
          const page = yield* Effect.promise(() => lab(get(asked), bound).then((r) => r.text()));
          expect([path, page]).toEqual([path, `404 {"_tag":"RouteUnknown","path":"${path}"}`]);
        }
        // An API path is read as ever.
        const notes = labUrls.notes.list({ params: { film: 'f' } });
        const read = `/?read=${encodeURIComponent(notes)}`;
        expect(yield* Effect.promise(() => lab(get(read), bound).then((r) => r.text()))).toMatch(
          /^200 \{/,
        );
      }).pipe(Effect.scoped, Effect.provide(labLayer(files(), askedPages))),
  );

  it.effect(
    "a compressed page's Vary names its coding once, beside what it already varies by",
    () =>
      Effect.gen(function* () {
        const lab = yield* labHandler(LOOPBACK);
        for (const [vary, sent] of [
          ['accept-encoding', 'accept-encoding'],
          ['Origin', 'Origin, Accept-Encoding'],
          ['*', '*'],
        ] as const) {
          const page = yield* Effect.promise(() =>
            lab(get(`/?vary=${encodeURIComponent(vary)}`, { 'accept-encoding': 'br' }), bound),
          );
          expect([vary, page.headers.get('content-encoding'), page.headers.get('vary')]).toEqual([
            vary,
            'br',
            sent,
          ]);
        }
      }).pipe(Effect.scoped, Effect.provide(labLayer(files(), askedPages))),
  );

  it.live("a page's read its render gives up stops that read's request in the lab", () =>
    Effect.gen(function* () {
      const ended = yield* Deferred.make<void>();
      const lab = yield* labHandler(LOOPBACK, heldRoute(ended));
      const page = yield* Effect.promise(() => lab(get('/'), bound).then((r) => r.text()));
      expect(page).toBe('gave up');
      const stopped = yield* Deferred.await(ended).pipe(Effect.timeoutOption('2 seconds'));
      expect(Option.isSome(stopped)).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(labLayer(files(), givingUpPages))),
  );

  it.live(
    "a page is sent compressed by the request's Accept-Encoding, br first; a streamed page's shell arrives before its render ends",
    () => {
      const ended = Deferred.makeUnsafe<void>();
      return Effect.gen(function* () {
        const lab = yield* labHandler(LOOPBACK);
        const zipped = yield* Effect.promise(() =>
          lab(get('/', { 'accept-encoding': 'gzip' }), bound),
        );
        expect([zipped.headers.get('content-encoding'), zipped.headers.get('vary')]).toEqual([
          'gzip',
          'Accept-Encoding',
        ]);
        const reader = gunzipped(zipped);
        // The render has not ended: its shell is read all the same.
        const shell = yield* readTo(reader, SHELL.length).pipe(Effect.timeoutOption('2 seconds'));
        expect(shell).toEqual(Option.some(SHELL));
        yield* Deferred.done(ended, Exit.void);
        expect(yield* readTo(reader, Infinity)).toBe(REST);

        const brotli = yield* Effect.promise(() =>
          lab(get('/', { 'accept-encoding': 'gzip, br' }), bound),
        );
        expect(brotli.headers.get('content-encoding')).toBe('br');
        const bytes = yield* Effect.promise(() => brotli.arrayBuffer());
        expect(new TextDecoder().decode(brotliDecompressSync(bytes))).toBe(SHELL + REST);

        const plain = yield* Effect.promise(() => lab(get('/'), bound));
        expect(plain.headers.get('content-encoding')).toBeNull();
        expect(yield* Effect.promise(() => plain.text())).toBe(SHELL + REST);
      }).pipe(Effect.scoped, Effect.provide(labLayer(files(), streamingPages(ended))));
    },
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
    'the gate: every route and every kind of page path, against every request it refuses, and what it lets in, each refusal logged once',
    () => {
      const logged: Array<string> = [];
      return Effect.gen(function* () {
        // The gate logs in the handler's own runtime: its logger goes in beside the routes.
        const lab = yield* labHandler(LOOPBACK, loggedInto(logged));
        const answer = (request: Request) =>
          Effect.gen(function* () {
            const res = yield* Effect.promise(() => lab(request, bound));
            const body = yield* Effect.promise(() => res.text());
            const tag = /"_tag":"(\w+)"/.exec(body)?.[1] ?? '';
            return [res.status, tag] as const;
          });
        /** Each refusal a row got, as the gate's log line names it (`api.request.refused`). */
        const refusals: Array<string> = [];
        /** `request`'s row: what it asks, and the status and refusal it gets. */
        const row = (request: Request) => {
          const url = new URL(request.url);
          return Effect.map(answer(request), ([status, tag]) => {
            if (tag !== '')
              refusals.push(
                `api.request.refused method=${request.method} path=${url.pathname} status=${status} tag=${tag}`,
              );
            return [`${request.method} ${url.pathname}${url.search}`, status, tag] as const;
          });
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
        /** A write with a body and no Content-Type, as a no-cors fetch of a typeless Blob sends. */
        const untyped = (path: string) =>
          new Request(at(path), { method: 'POST', body: new Blob([new Uint8Array([123, 125])]) });
        expect(untyped('/').headers.get('content-type')).toBeNull();
        /**
         * The writes the gate refuses on any path, before a route is matched: a
         * body that is not JSON (a form's three, or no type at all) and an Origin
         * that is not the lab's (another site's, a sandboxed frame's `null`, the
         * lab's own host over https).
         */
        const refusedWrites = (path: string) =>
          Effect.gen(function* () {
            for (const type of [
              'text/plain',
              'application/x-www-form-urlencoded',
              'multipart/form-data; boundary=x',
            ])
              expect(yield* row(post(path, '{}', { 'content-type': type }))).toEqual([
                `POST ${path}`,
                415,
                'WriteNotJson',
              ]);
            expect(yield* row(untyped(path))).toEqual([`POST ${path}`, 415, 'WriteNotJson']);
            for (const origin of ['http://evil.example', 'null', 'https://127.0.0.1:4401'])
              expect(yield* row(post(path, '{}', { origin }))).toEqual([
                `POST ${path}`,
                403,
                'RequestRefused',
              ]);
          });
        // Every route: a foreign Host (or the bound host without its port), a
        // cross-site or same-site request (a link opened on another site included:
        // a navigation reaches pages only), and every refused write.
        for (const route of foreignRequests(routes, 'http://127.0.0.1:4401', 'f')) {
          const path = new URL(route.url).pathname;
          const refused = [`${route.method} ${path}`, 403, 'RequestRefused'] as const;
          expect(yield* row(json(path, route.method, foreign))).toEqual(refused);
          expect(yield* row(json(path, route.method, { host: '127.0.0.1' }))).toEqual(refused);
          expect(yield* row(json(path, route.method, crossSite))).toEqual(refused);
          expect(yield* row(json(path, route.method, { 'sec-fetch-site': 'same-site' }))).toEqual(
            refused,
          );
          expect(yield* row(json(path, route.method, navigation))).toEqual(refused);
          yield* refusedWrites(path);
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
          // A HEAD's answer has no body to name its refusal: the log names it.
          expect(yield* row(new Request(at(path), { method: 'HEAD', headers: foreign }))).toEqual([
            `HEAD ${path}`,
            403,
            '',
          ]);
          refusals.push(
            `api.request.refused method=HEAD path=${new URL(at(path)).pathname} status=403 tag=RequestRefused`,
          );
          expect(
            yield* row(get(path, { 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'script' })),
          ).toEqual([`GET ${path}`, 403, 'RequestRefused']);
          // A page framed from another site is no link opened there.
          expect(yield* row(get(path, { ...navigation, 'sec-fetch-dest': 'iframe' }))).toEqual([
            `GET ${path}`,
            403,
            'RequestRefused',
          ]);
          expect(yield* row(json(path, 'POST', {}))).toEqual([`POST ${path}`, 405, '']);
          yield* refusedWrites(path);
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
        // Every refusal is one line of the gate's log, naming what was refused.
        const lines = logged
          .filter((line) => line.startsWith('api.request.refused '))
          .map((line) => line.split(' reason=')[0] ?? '');
        expect(refusals.length).toBeGreaterThan(600);
        expect(Arr.sort(lines, Order.String)).toEqual(Arr.sort(refusals, Order.String));
      }).pipe(Effect.scoped, Effect.provide(labLayer(files())));
    },
  );

  it.effect(
    "a handler's failure is logged with the request it answers: its method and path",
    () => {
      const logged: Array<string> = [];
      return Effect.gen(function* () {
        const lab = yield* labHandler(LOOPBACK, loggedInto(logged));
        const asked = labUrls.notes.list({ params: { film: 'nope' } });
        const status = yield* Effect.promise(() => lab(get(asked), bound).then((r) => r.status));
        expect(status).toBe(404);
        expect(
          logged
            .filter((line) => line.startsWith('api.request.failed '))
            .map((line) => line.split(' reason=')[0]),
        ).toEqual([`api.request.failed method=GET path=${asked} status=404 tag=FilmUnknown`]);
      }).pipe(Effect.scoped, Effect.provide(labLayer(files())));
    },
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
});

// A browser that leaves (a closed tab, a reload) aborts its request, and Bun
// interrupts the request's fiber wherever it is: the lab's real server on a
// free port, a real client, and a step of the page's answer under way.
describe('a client that goes away', () => {
  /**
   * The lab's real server on a free port, `beside` routes of the test's own:
   * its URL, and `gone`, done once the server hears a client leave before
   * its answer (the request's signal aborted, which interrupts the request's
   * fiber; Bun aborts it after an answer too).
   */
  const served = (beside: BesideRoutes = Layer.empty) =>
    Effect.gen(function* () {
      const lab = yield* labHandler(LOOPBACK, beside);
      const gone = yield* Deferred.make<void>();
      const server = yield* Layer.build(labServer({ hostname: '127.0.0.1', port: 0 }));
      const url = yield* serveLab((request, bound) => {
        const answered = Deferred.makeUnsafe<void>();
        // Heard after the lab's own listener, which interrupts the request's fiber.
        const answer = lab(request, bound);
        request.signal.addEventListener(
          'abort',
          () => {
            if (!Deferred.isDoneUnsafe(answered)) Deferred.doneUnsafe(gone, Exit.void);
          },
          { once: true },
        );
        return answer.finally(() => Deferred.doneUnsafe(answered, Exit.void));
      }).pipe(Effect.provideContext(server));
      return { url, gone };
    });

  /** The app's pages with a server render and its reads in a real worker. */
  const rendering = drivenPages(
    PageRenderer.layer.pipe(Layer.provide(BunServices.layer)),
    // The review's server render: its shell at once, then a read the lab holds.
    Option.some(
      `export default { bodyClass: 'held', render: ({ url, fetch }, sink) => { sink.head(''); sink.write('<main>shell</main>'); fetch(new URL('${HELD}', url)).finally(() => sink.end()); } };\n`,
    ),
  );

  const building = drivenPages(PageRenderer.layerTest);

  it.live(
    "mid-build leaves the build's watches whole: no folder held by a dead watch, none untracked, and a save there heard",
    () =>
      Effect.gen(function* () {
        const driven = yield* Driven;
        const { url, gone } = yield* served();
        const client = yield* HttpClient.HttpClient;
        const ask = Effect.orDie(client.get(url));
        const all = ['/app', '/app/a', DROPPED, '/app/sub'];
        /** The folders watched once the watches just started run. */
        const watchedSettled = (want: ReadonlyArray<string>) =>
          Effect.andThen(
            driven.watched.pipe(
              Effect.repeat({
                until: (dirs) => dirs.join() === want.join(),
                schedule: Schedule.spaced('20 millis'),
              }),
              Effect.timeoutOption('2 seconds'),
            ),
            driven.watched,
          );
        expect((yield* ask).status).toBe(200);
        expect(yield* watchedSettled(all)).toEqual(all);
        // The page stops reading DROPPED: the next build lets its watch go, and the
        // client leaves while it does.
        yield* Ref.set(driven.reads, [SOURCES[0]]);
        yield* heardOf(driven.save(SOURCES[0], 'export const a = 2;\n'));
        yield* Ref.set(driven.held, true);
        const leaving = yield* Effect.forkChild(ask);
        yield* Deferred.await(driven.dropping);
        yield* Fiber.interrupt(leaving);
        yield* Deferred.await(gone);
        yield* Ref.set(driven.held, false);
        yield* Deferred.done(driven.release, Exit.void);
        // The page reads DROPPED again: its next build watches it anew.
        yield* Ref.set(driven.reads, SOURCES);
        yield* heardOf(driven.save(SOURCES[0], 'export const a = 3;\n'));
        expect((yield* ask).status).toBe(200);
        expect(yield* watchedSettled(all)).toEqual(all);
        const since = (yield* buildNow).build;
        const heard = yield* heardOf(driven.save(SOURCES[1], 'export const b = 2;\n'));
        expect(heard).toBeGreaterThan(since);
      }).pipe(
        Effect.scoped,
        Effect.provide([labLayer(files(), building), building, FetchHttpClient.layer]),
      ),
  );

  it.live(
    "mid-render stops the render's held read in the lab: the client gone, the stream, the render and the read each stopped",
    () =>
      Effect.gen(function* () {
        const asked = yield* Deferred.make<void>();
        const ended = yield* Deferred.make<void>();
        const { url } = yield* served(heldRoute(ended, asked));
        const client = yield* HttpClient.HttpClient;
        const shell = yield* Deferred.make<string>();
        // A browser's GET of the page, br accepted: it reads the shell and stays, until it leaves.
        const reading = yield* Effect.forkChild(
          Effect.flatMap(
            Effect.orDie(client.get(url, { headers: { 'accept-encoding': 'br' } })),
            (response) =>
              response.stream.pipe(
                Stream.decodeText(),
                Stream.runForEach((chunk) => Deferred.succeed(shell, chunk)),
                Effect.orDie,
              ),
          ),
        );
        expect(yield* Deferred.await(shell)).toContain('<body class="held">');
        yield* Deferred.await(asked);
        yield* Fiber.interrupt(reading);
        const stopped = yield* Deferred.await(ended).pipe(Effect.timeoutOption('3 seconds'));
        expect(Option.isSome(stopped)).toBe(true);
      }).pipe(
        Effect.scoped,
        Effect.provide([labLayer(files(), rendering), rendering, FetchHttpClient.layer]),
      ),
  );
});
