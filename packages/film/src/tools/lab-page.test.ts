// The lab's pages as a browser meets them: a page is built when first asked
// and stamped with its build and its server, its script sent compressed, its
// server entry rendered into it, an old link sent on to its place; a page
// another lab process served hears at once that it is old; a look's build is
// the files as they stand, and a wedge builds them with a file read as other
// text. What wakes a waiting page has files of its own, so the runner's
// workers take them side by side: a save (`lab-page-saves.test.ts`), the
// watches as a build's reads change (`lab-page-watches.test.ts`), a mix
// (`lab-page-mixes.test.ts`) and a page that does not build
// (`lab-page-failures.test.ts`). The app they serve is `fixtures/lab-app.ts`.

import { BunHttpPlatform } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import {
  DateTime,
  Deferred,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Ref,
  Schedule,
  Schema,
  Stream,
} from 'effect';
import { TestClock } from 'effect/testing';
import { brotliCompressSync, brotliDecompressSync, constants as zlib } from 'node:zlib';
import { LabHttpApi } from '../core/api.ts';
import { type FootageLock, FootageLockJson } from '../core/footage.ts';
import { PAGE_CUT_MARK } from '../core/page-render.ts';
import { PageBundler, splice } from './lab-page.ts';
import { serveApi } from './api-server.ts';
import { PageRenderer, RenderFailed } from './page-render.ts';
import { memoryFileSystem, text } from './testing.ts';
import { Platform, html, appFolder, served, app, buildOf, serverOf } from './fixtures/lab-app.ts';

/** A Mac's Chrome, as its `User-Agent` names it. */
const MAC_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';

describe('lab pages', () => {
  it.live(
    "the browser build is Solid's development build, whatever NODE_ENV says: its diagnostics are what the served e2e reads",
    () =>
      Effect.gen(function* () {
        const { spec, write } = yield* appFolder;
        const path = yield* Path.Path;
        // A page whose script is a Solid one, so the build holds Solid itself.
        const solid = path.join(import.meta.dir, '../lab/fixtures/on-screen-page.tsx');
        yield* write(
          'review.html',
          html('review', path.relative(path.dirname(spec.pages.review), solid)),
        );
        const { ask } = yield* served(spec, PageBundler.layer);
        const page = (yield* ask('/')).text;
        const src = /src="\.?(\/[^"]+\.js)"/.exec(page)?.[1] ?? '';
        expect((yield* ask(src)).text).toContain('STRICT_READ_UNTRACKED');
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    'a page is built when asked, stamped with its build and server; its script is served, nothing else',
    () =>
      Effect.gen(function* () {
        const { ask, script } = yield* app;
        const page = yield* ask('/');
        expect([page.status, buildOf(page.text)]).toEqual([200, 0]);
        expect(serverOf(page.text)).not.toBe('');
        expect(yield* script).toContain('first');
        expect((yield* ask('/nothing.js')).status).toBe(404);
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    "a page's script is sent as its best brotli once made, to a request whose coding is br; as it is to one that takes no br",
    () =>
      Effect.gen(function* () {
        const { ask, write } = yield* app;
        yield* write('src/lab.ts', `console.log('${'the lab '.repeat(400)}');\n`);
        const src = /src="\.?(\/[^"]+\.js)"/.exec((yield* ask('/films/f/lab')).text)?.[1] ?? '';
        const brotli = yield* ask(src, 'GET', { 'accept-encoding': 'gzip, br' }).pipe(
          Effect.repeat({
            until: (sent) => sent.encoding === 'br',
            schedule: Schedule.spaced('50 millis'),
          }),
          Effect.timeout('4 seconds'),
        );
        const plain = yield* ask(src, 'GET', { 'accept-encoding': 'gzip;q=1, br;q=0' });
        expect(plain.encoding).toBe('');
        expect(plain.text).toContain('the lab the lab');
        expect(new Uint8Array(brotliDecompressSync(brotli.bytes))).toEqual(plain.bytes);
        const best = brotliCompressSync(plain.bytes, {
          params: { [zlib.BROTLI_PARAM_QUALITY]: 11 },
        });
        expect(brotli.bytes.byteLength).toBe(best.byteLength);
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    "a script's coding over HTTP is the server's compression's own, before and after its best brotli is made: a header Effect refuses whole is answered as it is",
    () =>
      Effect.gen(function* () {
        const { ask, page, write } = yield* app;
        yield* write('src/lab.ts', `console.log('${'the lab '.repeat(400)}');\n`);
        const handler = yield* serveApi(LabHttpApi, Layer.empty, {
          page: page.answer,
          beside: Layer.empty,
        });
        /** `pathname` answered over HTTP for `accept`: its coding, and its body read whole. */
        const sent = (pathname: string, accept: string) =>
          Effect.gen(function* () {
            const response = yield* Effect.promise(() =>
              handler(
                new Request(`http://127.0.0.1:8229${pathname}`, {
                  headers: { host: '127.0.0.1:8229', 'accept-encoding': accept },
                }),
                { hostname: '127.0.0.1', port: 8229 },
              ),
            );
            const body = yield* Effect.promise(() => response.text());
            return { coding: response.headers.get('content-encoding') ?? '', body };
          });
        const codingOf = (pathname: string, accept: string) =>
          Effect.map(sent(pathname, accept), (answer) => answer.coding);
        const lab = (yield* sent('/films/f/lab', 'identity')).body;
        const src = /src="\.?(\/[^"]+\.js)"/.exec(lab)?.[1] ?? '';
        const headers = [
          'br',
          'gzip, br',
          'br;q=0, gzip',
          'BR ; q=1',
          '*',
          'identity',
          'br;q=2',
          'br, gzip;q=oops',
          'br;q=1;level=3',
          'br,',
        ];
        // Cold: no best brotli yet, every coding the compression's (the page's own answer is never kept compressed).
        const cold = yield* Effect.forEach(headers, (accept) => codingOf('/', accept));
        expect(cold.slice(0, 6)).toEqual(['br', 'br', 'gzip', 'br', 'br', '']);
        expect(cold.slice(6)).toEqual(['', '', '', '']);
        // Ready: the script's best brotli made (the page's own answer sends it compressed only
        // once made, where over HTTP the compression would send br anyway), then sent for the
        // same headers, and only those.
        yield* ask(src, 'GET', { 'accept-encoding': 'br' }).pipe(
          Effect.repeat({
            until: (asked) => asked.encoding === 'br',
            schedule: Schedule.spaced('50 millis'),
          }),
          Effect.timeout('4 seconds'),
        );
        const ready = yield* Effect.forEach(headers, (accept) => codingOf(src, accept));
        expect(ready).toEqual(cold);
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    "a page with a server entry is answered rendered: the render's head before </head>, its body's class on <body>, its markup first in the body, at the URL asked, for the browser that asked",
    () =>
      Effect.gen(function* () {
        const { spec } = yield* appFolder;
        const { ask } = yield* served(spec, PageBundler.layerTest);
        const page = yield* ask('/sets/root/folder?view=all');
        expect(page.status).toBe(200);
        expect(buildOf(page.text)).toBe(0);
        expect(page.text).toContain('<meta name="rendered" content="review"></head>');
        expect(page.text).toContain(
          '<body class="rendered"><main>review at http://127.0.0.1:8229/sets/root/folder?view=all</main><script type="module" src="./src/p.ts"></script></body>',
        );
        // Asked by a Mac's browser, it is rendered for a Mac (its chords labelled as a Mac labels them).
        const asMac = yield* ask('/sets/root/folder?view=all', 'GET', { 'user-agent': MAC_AGENT });
        expect(asMac.text).toContain(
          '<main>review at http://127.0.0.1:8229/sets/root/folder?view=all for a Mac</main>',
        );
        // The lab has no server entry: its page is as built.
        const lab = yield* ask('/films/f/lab');
        expect(lab.text).toContain('<body><script type="module" src="./src/lab.ts"></script>');
        expect(lab.text).not.toContain('rendered');
        // A HEAD is the page's headers: nothing is rendered for it.
        const head = yield* ask('/', 'HEAD');
        expect([head.status, head.text.includes('<main>')]).toEqual([200, false]);
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    'a render that fails before its head answers the page as built; one cut short leaves what it wrote, the mark of a cut, then the rest of the page',
    () =>
      Effect.gen(function* () {
        const { spec } = yield* appFolder;
        const failing = Layer.succeed(
          PageRenderer,
          PageRenderer.of({
            render: () => Effect.fail(RenderFailed.make({ reason: 'no worker' })),
          }),
        );
        const unrendered = (yield* (yield* served(spec, PageBundler.layerTest, failing)).ask('/'))
          .text;
        expect(unrendered).toContain('</head><body><script type="module" src="./src/p.ts">');
        const cut = Layer.succeed(
          PageRenderer,
          PageRenderer.of({
            render: () =>
              Effect.succeed({
                head: '',
                bodyClass: 'rv',
                markup: Stream.concat(
                  Stream.make('<main>half'),
                  Stream.fail(RenderFailed.make({ reason: 'the worker stopped' })),
                ),
              }),
          }),
        );
        const half = (yield* (yield* served(spec, PageBundler.layerTest, cut)).ask('/')).text;
        // Marked as cut, so the browser renders the page anew (`mountPage`).
        expect(half).toContain(
          `<body class="rv"><main>half${PAGE_CUT_MARK}<script type="module" src="./src/p.ts"></script></body></html>`,
        );
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.effect("a render's body class joins the page's own, its other attributes kept", () =>
    Effect.sync(() => {
      const page = '<html><head><title>t</title></head><body id="b" class="lab"><p>x</p></body>';
      expect(splice(page, { head: '<style></style>', bodyClass: 'rv' })).toEqual(
        Option.some([
          '<html><head><title>t</title><style></style></head><body id="b" class="lab rv">',
          '<p>x</p></body>',
        ]),
      );
      expect(splice('<p>no head</p>', { head: '', bodyClass: 'rv' })).toEqual(Option.none());
    }),
  );

  it.live(
    "the UI faces' files are a page's own assets: each at an absolute URL, answered as a woff2",
    () =>
      Effect.gen(function* () {
        const { ask, script, write } = yield* app;
        // The review imports the framework's faces, as every page with chrome does.
        yield* write(
          'src/p.ts',
          `import { registerFace } from '${import.meta.dir}/../player/face.ts';\nconsole.log(registerFace);\n`,
        );
        const urls = Array.from(
          (yield* script).matchAll(/["'`]([^"'`]*\.woff2)["'`]/g),
          (m) => m[1] ?? '',
        );
        expect(urls.map((url) => url.replace(/-\w+\.woff2$/, '')).toSorted()).toEqual([
          '/geist-latin-ext-wght-normal',
          '/geist-latin-wght-normal',
          '/geist-mono-latin-ext-wght-normal',
          '/geist-mono-latin-wght-normal',
          '/geist-mono-symbols2-wght-normal',
        ]);
        for (const url of urls) {
          const font = yield* ask(url);
          expect([url, font.status, font.type]).toEqual([url, 200, 'font/woff2']);
          expect(font.text.length).toBeGreaterThan(1000);
        }
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    "each place serves its page, whose scripts load from the root; a film's other paths are no narration",
    () =>
      Effect.gen(function* () {
        const { ask, scriptOf } = yield* app;
        const titleOf = (pathname: string) =>
          Effect.map(
            ask(pathname),
            (r) => [r.status, /<title>(\w+)</.exec(r.text)?.[1] ?? ''] as const,
          );
        const places = {
          '/': 'review',
          '/sets/root/folder': 'review',
          '/films/f/scenes': 'player',
          '/films/f/scenes/hand': 'player',
          '/films/f/choices': 'review',
          '/films/f/project': 'review',
          '/films/f/lab': 'lab',
          '/films/f/lab/hand': 'lab',
          '/films/f/play': 'player',
          '/films/f/export': 'render',
        };
        for (const [pathname, page] of Object.entries(places))
          expect([pathname, ...(yield* titleOf(pathname))]).toEqual([pathname, 200, page]);
        // A film's export page runs the render page's script (its handle), never Play's.
        expect(yield* scriptOf('/films/f/export')).toContain('the render page');
        expect(yield* scriptOf('/films/f/export')).not.toContain('the player');
        // A page deep under a film's path finds its script: the HTML links it from the root.
        const page = (yield* ask('/films/f/lab/hand')).text;
        expect(page).toMatch(/src="\/[^"]+\.js"/);
        expect(yield* scriptOf('/films/f/lab/hand')).toContain('the lab');
        expect(yield* scriptOf('/films/f/play')).toContain('the player');
        // No page at a path no place declares, nor a narration file of a film that has none.
        for (const pathname of ['/films/f', '/films/f/lab/', '/films/f/narration/full.wav', '/p'])
          expect([pathname, (yield* ask(pathname)).status]).toEqual([pathname, 404]);
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live('an old link is sent on to its place', () =>
    Effect.gen(function* () {
      const { ask } = yield* app;
      const old = {
        '/lab?film=f': '/films/f/lab',
        '/lab?film=f&sel=cue:hand:rise': '/films/f/lab/hand?cue=rise',
        '/lab': '/',
        '/player?film=f&lookbook': '/films/f/scenes',
        '/player?film=f': '/films/f/play',
        '/?project=f': '/films/f/project',
        '/?film=f': '/films/f/choices',
        // A render link lands on the film's export page, the build it pins kept.
        '/films/f/play?export&build=3': '/films/f/export?build=3',
        '/?film=f&export': '/films/f/export',
        '/?folder=root%2Fout&set=render%3Ascenes%3Ahand&view=moments&m=1':
          '/sets/root%2Fout/render:scenes:hand?view=moments&m=1',
      };
      for (const [from, to] of Object.entries(old)) {
        const answer = yield* ask(from);
        expect([from, answer.status, answer.location]).toEqual([from, 302, to]);
      }
    }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    "plays a take's copy the footage library lists, by the range asked, and answers any other footage path with a 404, never a page",
    () =>
      Effect.gen(function* () {
        const { spec } = yield* appFolder;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const sha256 = 'abcdef012345'.padEnd(64, '0');
        const lock: FootageLock = {
          version: 1,
          footage: {
            'take.why': {
              kind: 'take',
              sha256,
              bytes: 1,
              ext: '.mov',
              probe: {
                container: 'mp4',
                duration: 1,
                picture: {
                  codec: 'hevc',
                  width: 1080,
                  height: 1920,
                  rotation: 0,
                  fps: 30,
                  variable: false,
                  start: 0,
                },
              },
            },
          },
        };
        yield* fs.makeDirectory(spec.footage.dir, { recursive: true });
        yield* fs.writeFileString(
          path.join(spec.footage.dir, 'library.lock.json'),
          yield* Schema.encodeEffect(FootageLockJson)(lock),
        );
        const copies = path.join(spec.footage.out, 'footage', 'take.why', 'abcdef012345');
        yield* fs.makeDirectory(copies, { recursive: true });
        yield* fs.writeFileString(path.join(copies, 'proxy.mp4'), 'the proxy');
        const { ask } = yield* served(spec, PageBundler.layerTest);
        const proxy = '/footage/take.why/abcdef012345/proxy.mp4';
        expect((yield* ask(proxy)).text).toBe('the proxy');
        const part = yield* ask(proxy, 'GET', { range: 'bytes=4-8' });
        expect([part.status, part.text]).toEqual([206, 'proxy']);
        for (const other of [
          '/footage/take.why/abcdef012345/mezzanine.mp4',
          '/footage/take.why/000000000000/proxy.mp4',
          '/footage/../out/footage/take.why/abcdef012345/proxy.mp4',
          '/footage/',
        ])
          expect((yield* ask(other)).status).toBe(404);
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    "a page another lab process served hears at once that it is old; its own server's waits",
    () =>
      Effect.gen(function* () {
        const { spec } = yield* appFolder;
        // The lab that served the page, then the lab after a restart, over the same folder.
        const before = yield* Effect.scoped(
          Effect.flatMap(served(spec, PageBundler.layerTest), ({ ask }) => ask('/')),
        );
        const after = yield* served(spec, PageBundler.layerTest);
        const page = {
          since: buildOf(before.text),
          server: Option.some(serverOf(before.text)),
          film: Option.none(),
        };
        // At once: well before the 10 s a wait may hold.
        const heard = yield* after.page
          .wait(page, '10 seconds')
          .pipe(Effect.timeout('1 second'), Effect.orDie);
        expect(heard.server).not.toBe(serverOf(before.text));
        // A page this lab served waits for a change, as before.
        const own = yield* after.page.wait(
          { since: heard.build, server: Option.some(heard.server), film: Option.none() },
          '300 millis',
        );
        expect(own).toEqual(heard);
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    "the build a look asks is the files' as they stand: a save just made is built first",
    () =>
      Effect.gen(function* () {
        const { ask, page, script, write } = yield* app;
        yield* ask('/');
        // Asked at once after the save, before any watch need have heard it.
        yield* write('src/p.ts', "console.log('saved just now');\n");
        const now = yield* page.built;
        expect(now.build.build).toBeGreaterThan(0);
        expect(Option.isNone(now.failed)).toBe(true);
        // The build the look was answered is the one the page serves, and it holds the save:
        // the watch hearing the save later builds nothing new.
        const served = yield* ask('/');
        expect(buildOf(served.text)).toBe(now.build.build);
        expect(yield* script).toContain('saved just now');
        // A page on the receipt waits on: no watch, nor the first build's check, counts the save.
        const after = yield* page.wait(
          { since: now.build.build, server: Option.some(now.build.server), film: Option.none() },
          '600 millis',
        );
        expect(after.build).toBe(now.build.build);
        expect(buildOf((yield* ask('/')).text)).toBe(now.build.build);
        // Asked again with nothing saved: the same build (once past a save in the build's own
        // millisecond, which is built again rather than risked).
        const settled = (yield* page.built).build.build;
        expect((yield* page.built).build.build).toBe(settled);
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    'a wedge builds the pages with a file read as other text, served by its id, the file unwritten, and never kept compressed',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { ask, page, script, scriptOf, spec } = yield* app;
        const shared = yield* fs.realPath(
          path.join(path.dirname(spec.pages.review), 'lib', 'shared.ts'),
        );
        // Long enough to be worth compressing, as a build's script is kept.
        const swapped = new Map([
          [shared, `export const shared = 'shared swapped${' swapped'.repeat(200)}';\n`],
        ]);
        const wedged = yield* page.wedge(swapped);
        expect(wedged.failed).toEqual(Option.none());
        expect(wedged.wedge).not.toBe('');
        const html = (yield* ask(`/?wedge=${wedged.wedge}`)).text;
        expect(html).toContain(`src="/wedge/${wedged.wedge}/`);
        expect(yield* scriptOf(`/?wedge=${wedged.wedge}`)).toContain('shared swapped');
        // Only the easel's browser on the box asks for a wedge's files: each is sent as
        // it is, for the server to compress per request, never squeezed at the best.
        const src = /src="\.?(\/[^"]+\.js)"/.exec(html)?.[1] ?? '';
        const squeezed = yield* ask(src, 'GET', { 'accept-encoding': 'br' }).pipe(
          Effect.repeat({
            until: (sent) => sent.encoding === 'br',
            schedule: Schedule.spaced('50 millis'),
          }),
          Effect.timeoutOption('500 millis'),
        );
        expect(squeezed).toEqual(Option.none());
        // The pages as written, and the file, are as they were.
        expect(yield* script).toContain('shared one');
        expect(yield* fs.readFileString(shared)).toContain('shared one');
        // The same swap again is the same wedge; one never built is no page.
        expect((yield* page.wedge(swapped)).wedge).toBe(wedged.wedge);
        expect((yield* ask('/?wedge=nope')).status).toBe(404);
        // A swap no build reads is refused, not drawn as the source it was to replace.
        const unread = yield* page.wedge(new Map([['/nonexistent/loop-probe-x.ts', '']]));
        expect(unread.wedge).toBe('');
        expect(Option.getOrElse(unread.failed, () => '')).toContain('read none of');
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );
});

/**
 * The app's three pages in a file system in memory (no watch hears a save
 * there), each page its HTML as written (`PageBundler.layerTest`); `mtimes`
 * says each file's mtime as its stat reports it (0 unless set), and
 * `afterRead` runs once each read of a file has been answered.
 */
const memoryApp = (
  mtimes: Map<string, number> = new Map(),
  afterRead: (file: string) => Effect.Effect<void> = () => Effect.void,
) => {
  const files = new Map<string, Uint8Array>([
    ['/app/review.html', text(html('review old', './src/p.ts'))],
    ['/app/lab.html', text(html('lab', './src/lab.ts'))],
    ['/app/sub/player.html', text(html('player', '../src/play.ts'))],
    ['/app/index.html', text(html('render', './src/render.ts'))],
  ]);
  const spec = {
    pages: {
      review: '/app/review.html',
      lab: '/app/lab.html',
      player: '/app/sub/player.html',
      render: '/app/index.html',
    },
    servers: {},
    films: '/app/src/films',
    footage: { dir: '/app/footage', out: '/app/out' },
  };
  const fileSystem = Layer.effect(
    FileSystem.FileSystem,
    Effect.map(FileSystem.FileSystem, (fs) =>
      FileSystem.FileSystem.of({
        ...fs,
        stat: (file) =>
          Effect.map(fs.stat(file), (info) => ({
            ...info,
            mtime: Option.some(DateTime.toDateUtc(DateTime.makeUnsafe(mtimes.get(file) ?? 0))),
          })),
        readFile: (file) => Effect.tap(fs.readFile(file), () => afterRead(file)),
      }),
    ),
  ).pipe(Layer.provide(memoryFileSystem(files)));
  return {
    files,
    spec,
    layer: BunHttpPlatform.layer.pipe(Layer.provideMerge(Layer.mergeAll(fileSystem, Path.layer))),
  };
};

/**
 * The test bundler, whose first build waits once it has read its pages:
 * `reading` is done then, and the build goes on once `release` is.
 */
const holdingFirst = (reading: Deferred.Deferred<boolean>, release: Deferred.Deferred<boolean>) =>
  Layer.effect(
    PageBundler,
    Effect.gen(function* () {
      const inner = yield* PageBundler;
      const builds = yield* Ref.make(0);
      return PageBundler.of({
        bundle: (entries, root, how) =>
          Effect.tap(inner.bundle(entries, root, how), () =>
            Effect.gen(function* () {
              if ((yield* Ref.getAndUpdate(builds, (n) => n + 1)) > 0) return;
              yield* Deferred.succeed(reading, true);
              yield* Deferred.await(release);
            }),
          ),
      });
    }),
  ).pipe(Layer.provide(PageBundler.layerTest));

/** The test bundler, setting `bundled` once a build has read its pages while `armed` is. */
const noting = (armed: Ref.Ref<boolean>, bundled: Ref.Ref<boolean>) =>
  Layer.effect(
    PageBundler,
    Effect.gen(function* () {
      const inner = yield* PageBundler;
      return PageBundler.of({
        bundle: (entries, root, how) =>
          Effect.tap(inner.bundle(entries, root, how), () =>
            Effect.flatMap(Ref.get(armed), (on) => Ref.set(bundled, on)),
          ),
      });
    }),
  ).pipe(Layer.provide(PageBundler.layerTest));

describe("a look's build, against saves no watch hears", () => {
  // A save that lands once a build has read the page and printed it as read: the first read
  // of the page after the bundler's (the build's own print of it) lands it, unheard.
  const armed = Ref.makeUnsafe(false);
  const bundled = Ref.makeUnsafe(false);
  const landing = memoryApp(new Map(), (file) =>
    Effect.gen(function* () {
      if (file !== '/app/review.html' || !(yield* Ref.get(bundled))) return;
      yield* Ref.set(bundled, false);
      yield* Ref.set(armed, false);
      landing.files.set(file, text(html('review new', './src/p.ts')));
    }),
  );
  it.effect(
    'a save landing after a build printed what it read is never answered as that build',
    () =>
      Effect.gen(function* () {
        const { page, ask } = yield* served(landing.spec, noting(armed, bundled));
        yield* page.built;
        landing.files.set('/app/review.html', text(html('review middle', './src/p.ts')));
        yield* Ref.set(armed, true);
        // The look's build reads the middle save; the new one lands as soon as it has printed it.
        const receipt = yield* page.built;
        expect(yield* Ref.get(armed)).toBe(false);
        const now = yield* ask('/');
        expect(now.text).toContain('review new');
        expect(buildOf(now.text)).toBe(receipt.build.build);
        // The look's page is the build it was answered, by its own number, whatever is built after.
        const pinned = `/?build=${receipt.kept}`;
        expect((yield* ask(pinned)).text).toContain('review new');
        landing.files.set('/app/review.html', text(html('review newer', './src/p.ts')));
        const after = yield* page.built;
        expect(after.kept).toBeGreaterThan(receipt.kept);
        expect((yield* ask('/')).text).toContain('review newer');
        const still = yield* ask(pinned);
        expect(still.text).toContain('review new<');
        // Served as made: it waits on no build, so it never reloads itself off the look's build.
        expect(still.text).not.toContain('lab-build');
        expect((yield* ask('/?build=999')).status).toBe(404);
      }).pipe(Effect.scoped, Effect.provide(landing.layer)),
  );

  const app = memoryApp();
  it.live('a save made while a build reads is never answered as fresh', () =>
    Effect.gen(function* () {
      const reading = yield* Deferred.make<boolean>();
      const release = yield* Deferred.make<boolean>();
      const { page, ask } = yield* served(app.spec, holdingFirst(reading, release));
      const first = yield* Effect.forkChild(page.built);
      // The build has read the page; it is saved anew while the build is under way, and a
      // look asks then.
      yield* Deferred.await(reading);
      app.files.set('/app/review.html', text(html('review new', './src/p.ts')));
      const second = yield* Effect.forkChild(page.built);
      yield* Deferred.succeed(release, true);
      yield* Fiber.join(first);
      const receipt = yield* Fiber.join(second);
      const now = yield* ask('/');
      expect(now.text).toContain('review new');
      expect(buildOf(now.text)).toBe(receipt.build.build);
    }).pipe(Effect.scoped, Effect.provide(app.layer)),
  );

  const coarse = new Map<string, number>();
  const later = memoryApp(coarse);
  it.effect("a save whose mtime reads before its build began is the look's still", () =>
    Effect.gen(function* () {
      // The build begins half a second into a second whose files' mtimes the file system
      // keeps to the whole second.
      yield* TestClock.setTime(1500);
      const { page, ask } = yield* served(later.spec, PageBundler.layerTest);
      const before = yield* page.built;
      expect((yield* ask('/')).text).toContain('review old');
      later.files.set('/app/review.html', text(html('review new', './src/p.ts')));
      coarse.set('/app/review.html', 1000);
      const receipt = yield* page.built;
      const now = yield* ask('/');
      expect(now.text).toContain('review new');
      expect(buildOf(now.text)).toBe(receipt.build.build);
      expect(receipt.build.build).toBeGreaterThan(before.build.build);
    }).pipe(Effect.scoped, Effect.provide(later.layer)),
  );
});
