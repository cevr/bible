// The lab's pages as a browser and an editor meet them: a page is built when
// first asked and stamped with its build and its server; a change to a file
// it was built from (its source, its HTML entry, another package's source)
// wakes a waiting page and the next ask is the new code; a change to anything
// else (a render, a note) wakes nothing; a page another lab process served
// hears at once that it is old; a page that does not build answers the
// bundler's words, asks again with a pause, and serves again once fixed.

import { BunHttpPlatform, BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import {
  Array as Arr,
  Context,
  Deferred,
  type Duration,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Path,
  Schedule,
} from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import { LabPage, PageBundler } from './lab-page.ts';

const Platform = Layer.provideMerge(BunHttpPlatform.layer, BunServices.layer);

const html = (title: string, script: string) =>
  `<!doctype html><html><head><title>${title}</title></head><body><script type="module" src="${script}"></script></body></html>`;

/**
 * An app in a temp folder: its review (`review.html` over `src/p.ts`, which
 * imports `lib/shared.ts`, another package's source), its lab and its player
 * (`sub/player.html`, an entry below the others). `write` writes a file
 * under the folder.
 */
const appFolder = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped();
  for (const folder of ['src/films', 'sub', 'lib', 'extra'])
    yield* fs.makeDirectory(path.join(dir, folder), { recursive: true });
  const write = (name: string, text: string) => fs.writeFileString(path.join(dir, name), text);
  yield* write('review.html', html('review', './src/p.ts'));
  yield* write('lab.html', html('lab', './src/lab.ts'));
  yield* write('sub/player.html', html('player', '../src/play.ts'));
  yield* write(
    'src/p.ts',
    "import { shared } from '../lib/shared.ts';\nconsole.log('first', shared);\n",
  );
  yield* write('lib/shared.ts', "export const shared = 'shared one';\n");
  yield* write('src/lab.ts', "console.log('the lab');\n");
  yield* write('src/play.ts', "console.log('the player');\n");
  yield* write('src/notes.json', '{}');
  const spec = {
    pages: {
      review: path.join(dir, 'review.html'),
      lab: path.join(dir, 'lab.html'),
      player: path.join(dir, 'sub', 'player.html'),
    },
    films: path.join(dir, 'src', 'films'),
  };
  return { spec, write };
});

/** The pages over a folder, as one lab process serves them, with `bundler`. */
const served = (
  spec: Effect.Success<typeof appFolder>['spec'],
  bundler: Layer.Layer<PageBundler, never, FileSystem.FileSystem | Path.Path>,
) =>
  Effect.gen(function* () {
    const page = Context.get(
      yield* Layer.build(LabPage.layer(spec).pipe(Layer.provide(bundler))),
      LabPage,
    );
    const ask = (pathname: string) =>
      Effect.gen(function* () {
        const request = HttpServerRequest.fromWeb(new Request(`http://127.0.0.1:8229${pathname}`));
        const response = HttpServerResponse.toWeb(
          yield* page.answer.pipe(
            Effect.provideService(HttpServerRequest.HttpServerRequest, request),
          ),
        );
        return { status: response.status, text: yield* Effect.promise(() => response.text()) };
      });
    return { page, ask };
  });

/** The app over Bun's bundler. */
const app = Effect.gen(function* () {
  const { spec, write } = yield* appFolder;
  const { page, ask } = yield* served(spec, PageBundler.layer);
  /** The script of the page `pathname` serves, as its HTML names it. */
  const scriptOf = (pathname: string) =>
    Effect.gen(function* () {
      const text = (yield* ask(pathname)).text;
      const src = /src="\.?(\/[^"]+\.js)"/.exec(text)?.[1] ?? '';
      return (yield* ask(src)).text;
    });
  const script = scriptOf('/');
  /**
   * A wait past `since`, while `name` is written as `text` until it answers:
   * the watch may start after the first write, and the same bytes again are
   * the same change.
   */
  const waitWriting = (since: number, timeout: Duration.Input, name: string, text: string) =>
    Effect.raceFirst(
      page.wait({ since, server: Option.none() }, timeout),
      write(name, text).pipe(
        Effect.repeat(Schedule.spaced('200 millis')),
        Effect.andThen(Effect.never),
      ),
    );
  /** A wait past `since` after `name` is written as `text` once: one save, heard or not. */
  const waitOnce = (since: number, timeout: Duration.Input, name: string, text: string) =>
    Effect.andThen(write(name, text), page.wait({ since, server: Option.none() }, timeout));
  return { ask, script, scriptOf, waitWriting, waitOnce, write };
});

const buildOf = (text: string) => Number(/name="lab-build" content="(\d+)"/.exec(text)?.[1]);
const serverOf = (text: string) => /name="lab-server" content="([^"]+)"/.exec(text)?.[1] ?? '';

describe('lab pages', () => {
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
          // The paths before the films' own, as links already handed out name them.
          '/lab': 'lab',
          '/player': 'player',
        };
        for (const [pathname, page] of Object.entries(places))
          expect([pathname, ...(yield* titleOf(pathname))]).toEqual([pathname, 200, page]);
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

  it.live(
    'a change to a file the page was built from wakes a wait, and the page is the new code',
    () =>
      Effect.gen(function* () {
        const { ask, script, waitWriting } = yield* app;
        yield* ask('/');
        const { build } = yield* waitWriting(
          0,
          '10 seconds',
          'src/p.ts',
          "console.log('second');\n",
        );
        expect(build).toBeGreaterThan(0);
        expect(buildOf((yield* ask('/')).text)).toBeGreaterThanOrEqual(build);
        expect(yield* script).toContain('second');
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    "the build's other files wake a wait too: its HTML entry, and another package's source",
    () =>
      Effect.gen(function* () {
        const { ask, script, waitWriting } = yield* app;
        yield* ask('/');
        const entry = yield* waitWriting(
          0,
          '10 seconds',
          'review.html',
          html('looked', './src/p.ts'),
        );
        expect(entry.build).toBeGreaterThan(0);
        expect((yield* ask('/')).text).toContain('<title>looked</title>');
        const shared = yield* waitWriting(
          entry.build,
          '10 seconds',
          'lib/shared.ts',
          "export const shared = 'shared two';\n",
        );
        expect(shared.build).toBeGreaterThan(entry.build);
        expect(yield* script).toContain('shared two');
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live('a change to a file no build read wakes nothing', () =>
    Effect.gen(function* () {
      const { ask, waitWriting } = yield* app;
      yield* ask('/');
      const { build } = yield* waitWriting(0, '1 second', 'src/notes.json', '{"seq":1}');
      expect(build).toBe(0);
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
        const page = { since: buildOf(before.text), server: Option.some(serverOf(before.text)) };
        // At once: well before the 10 s a wait may hold.
        const heard = yield* after.page
          .wait(page, '10 seconds')
          .pipe(Effect.timeout('1 second'), Effect.orDie);
        expect(heard.server).not.toBe(serverOf(before.text));
        // A page this lab served waits for a change, as before.
        const own = yield* after.page.wait(
          { since: heard.build, server: Option.some(heard.server) },
          '300 millis',
        );
        expect(own).toEqual(heard);
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live('a page that does not build answers the bundler, and serves again once fixed', () =>
    Effect.gen(function* () {
      const { ask, script, waitWriting } = yield* app;
      yield* ask('/');
      yield* waitWriting(0, '10 seconds', 'src/p.ts', "import './missing.ts';\n");
      const broken = yield* ask('/');
      expect(broken.status).toBe(500);
      expect(broken.text).toContain('missing.ts');
      // The failed build read nothing new; a fix to the file it last read is still heard.
      const built = buildOf(broken.text);
      yield* waitWriting(built, '10 seconds', 'src/p.ts', "console.log('fixed');\n");
      expect((yield* ask('/')).status).toBe(200);
      expect(yield* script).toContain('fixed');
    }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live('a first build that fails hears one save of its fix, with no build before it', () =>
    Effect.gen(function* () {
      const { spec, write } = yield* appFolder;
      yield* write('src/p.ts', "import './missing.ts';\n");
      const { page, ask } = yield* served(spec, PageBundler.layer);
      const broken = yield* ask('/');
      expect(broken.status).toBe(500);
      const since = buildOf(broken.text);
      yield* write('src/p.ts', "console.log('fixed cold');\n");
      const heard = yield* page.wait({ since, server: Option.none() }, '5 seconds');
      expect(heard.build).toBeGreaterThan(since);
      expect((yield* ask('/')).status).toBe(200);
    }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live('one save, made as the watched folders change, is heard', () =>
    Effect.gen(function* () {
      const { ask, script, waitWriting, waitOnce, write } = yield* app;
      yield* ask('/');
      // The page now reads one more folder: the watches change with its next build.
      yield* write('extra/x.ts', "export const x = 'x';\n");
      const moved = yield* waitWriting(
        0,
        '10 seconds',
        'src/p.ts',
        "import { shared } from '../lib/shared.ts';\nimport { x } from '../extra/x.ts';\nconsole.log(shared, x);\n",
      );
      expect((yield* ask('/')).status).toBe(200);
      // One save at once, to a folder watched before and after.
      const heard = yield* waitOnce(
        moved.build,
        '5 seconds',
        'lib/shared.ts',
        "export const shared = 'shared three';\n",
      );
      expect(heard.build).toBeGreaterThan(moved.build);
      expect(yield* script).toContain('shared three');
    }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    'a page that does not build asks again with a pause on every answer but newer code, and reloads once',
    () =>
      Effect.gen(function* () {
        const { ask, waitWriting } = yield* app;
        yield* ask('/');
        yield* waitWriting(0, '10 seconds', 'src/p.ts', "import './missing.ts';\n");
        const broken = (yield* ask('/')).text;
        const code = /<script>([\s\S]*)<\/script>/.exec(broken)?.[1] ?? '';
        const server = serverOf(broken);
        const build = buildOf(broken);
        // What the page hears: a proxy's 502, no answer, its own build again, then another server's.
        const answers = [
          { ok: false, json: {} },
          'unreachable',
          { ok: true, json: { build, server } },
          { ok: true, json: { build: 0, server: 'another' } },
        ] as const;
        const heard: Array<string> = [];
        let asked = 0;
        const reloaded = Deferred.makeUnsafe<void>();
        const fakeFetch = (url: string) => {
          heard.push(`ask ${url}`);
          // A page that asks past its last answer has missed newer code: the test ends there.
          if (asked >= answers.length) {
            Deferred.doneUnsafe(reloaded, Exit.void);
            return Effect.runPromise(Effect.never);
          }
          const answer = Arr.get(answers, asked);
          asked += 1;
          return Effect.runPromise(
            Option.match(
              Option.filter(answer, (a) => a !== 'unreachable'),
              {
                onNone: () => Effect.die('no answer'),
                onSome: (a) =>
                  Effect.succeed({
                    ok: a.ok,
                    json: () => Effect.runPromise(Effect.succeed(a.json)),
                  }),
              },
            ),
          );
        };
        const fakeTimeout = (resume: () => void, ms: number) => {
          heard.push(`pause ${ms}`);
          resume();
        };
        const location = {
          reload: () => {
            heard.push('reload');
            Deferred.doneUnsafe(reloaded, Exit.void);
          },
        };
        // The page's own script, run over a fake fetch, location and timer.
        new Function('fetch', 'location', 'setTimeout', code)(fakeFetch, location, fakeTimeout);
        yield* Deferred.await(reloaded);
        const wait = `/api/review/build?since=${build}&server=${server}`;
        expect(heard).toEqual([
          `ask ${wait}`,
          'pause 2000',
          `ask ${wait}`,
          'pause 2000',
          `ask ${wait}`,
          'pause 2000',
          `ask ${wait}`,
          'reload',
        ]);
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );
});
