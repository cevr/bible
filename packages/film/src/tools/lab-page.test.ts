// The lab's pages as a browser and an editor meet them: a page is built when
// first asked and stamped with its build and its server; a change to a file
// it was built from (its source, its HTML entry, another package's source)
// wakes a waiting page and the next ask is the new code; a mix landing the
// track a page asked for (before its first mix too) wakes that film's pages,
// and no other film's, with no new build; a change to anything
// else (a render, a note, a take's timings) wakes nothing; a page another lab process served
// hears at once that it is old; a page that does not build answers the
// bundler's words, asks again with a pause, and serves again once fixed.

import { BunHttpPlatform, BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import {
  Array as Arr,
  Context,
  DateTime,
  Deferred,
  type Duration,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Ref,
  Schedule,
} from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import { TestClock } from 'effect/testing';
import { LabPage, PageBundler } from './lab-page.ts';
import { memoryFileSystem, text } from './testing.ts';

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
        return {
          status: response.status,
          location: response.headers.get('location') ?? '',
          text: yield* Effect.promise(() => response.text()),
        };
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
      page.wait({ since, server: Option.none(), film: Option.none() }, timeout),
      write(name, text).pipe(
        Effect.repeat(Schedule.spaced('200 millis')),
        Effect.andThen(Effect.never),
      ),
    );
  /** A wait past `since` after `name` is written as `text` once: one save, heard or not. */
  const waitOnce = (since: number, timeout: Duration.Input, name: string, text: string) =>
    Effect.andThen(
      write(name, text),
      page.wait({ since, server: Option.none(), film: Option.none() }, timeout),
    );
  return { ask, page, script, scriptOf, spec, waitWriting, waitOnce, write };
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
        '/?folder=root%2Fout&set=render%3Ascenes%3Ahand&view=moments&m=1':
          '/sets/root%2Fout/render:scenes:hand?view=moments&m=1',
      };
      for (const [from, to] of Object.entries(old)) {
        const answer = yield* ask(from);
        expect([from, answer.status, answer.location]).toEqual([from, 302, to]);
      }
      // A renderer's export page is no old link.
      expect((yield* ask('/?film=f&export')).status).toBe(200);
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
      const { ask, page, waitWriting } = yield* app;
      yield* ask('/');
      // The first build may count once a save it read in the last second: the build once that is heard.
      const settled = (yield* page.wait(
        { since: 0, server: Option.none(), film: Option.none() },
        '1 second',
      )).build;
      const { build } = yield* waitWriting(settled, '1 second', 'src/notes.json', '{"seq":1}');
      expect(build).toBe(settled);
    }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    "a mix that lands the track a page was served wakes its wait and builds nothing; the take's timings saved before the mix wake nothing",
    () =>
      Effect.gen(function* () {
        const { spec } = yield* appFolder;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        // The test bundler, counted: a page asked again after a mix is not built again.
        const bundles = yield* Ref.make(0);
        const counted = Layer.effect(
          PageBundler,
          Effect.gen(function* () {
            const bundler = yield* PageBundler;
            return PageBundler.of({
              bundle: (entries, root, how) =>
                Effect.andThen(
                  Ref.update(bundles, (n) => n + 1),
                  bundler.bundle(entries, root, how),
                ),
            });
          }),
        ).pipe(Layer.provide(PageBundler.layerTest));
        // Film `f`, its track mixed and its timings.
        const film = path.join(spec.films, 'f');
        const narration = path.join(film, 'narration');
        yield* fs.makeDirectory(path.join(film, 'scenes'), { recursive: true });
        yield* fs.makeDirectory(narration, { recursive: true });
        yield* fs.writeFileString(path.join(film, 'scenes', 'index.ts'), 'export {};\n');
        yield* fs.writeFileString(path.join(narration, 'full.wav'), 'mix one');
        yield* fs.writeFileString(path.join(narration, 'timings.json'), '{}');
        const { page, ask } = yield* served(spec, counted);
        // The lab's page loads, and plays the film's track.
        yield* ask('/films/f/lab');
        expect((yield* ask('/films/f/narration/full.wav')).text).toBe('mix one');
        const f = { server: Option.none(), film: Option.some('f') };
        // The first build may count once a save it read in the last second: the build once that is heard.
        const settled = (yield* page.wait({ since: 0, ...f }, '1 second')).build;
        // A kept take's timings land before its mix: a page loaded then would play the old track.
        const timed = yield* Effect.andThen(
          fs.writeFileString(path.join(narration, 'timings.json'), '{"voice":""}'),
          page.wait({ since: settled, ...f }, '1 second'),
        );
        expect(timed.build).toBe(settled);
        // The mix lands its track whole, by a rename, as `film mix` does.
        yield* fs.writeFileString(path.join(narration, 'full.wav.partial'), 'mix two');
        const mixed = yield* Effect.andThen(
          fs.rename(path.join(narration, 'full.wav.partial'), path.join(narration, 'full.wav')),
          page.wait({ since: settled, ...f }, '5 seconds'),
        );
        expect(mixed.build).toBeGreaterThan(settled);
        // The page loaded again is stamped past the mix, so its own wait holds, and was not built again.
        const built = yield* Ref.get(bundles);
        expect(buildOf((yield* ask('/films/f/lab')).text)).toBeGreaterThanOrEqual(mixed.build);
        expect(yield* Ref.get(bundles)).toBe(built);
        expect((yield* ask('/films/f/narration/full.wav')).text).toBe('mix two');
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    "a film's first mix, with no track and no narration folder when its page loaded, wakes that page's wait",
    () =>
      Effect.gen(function* () {
        const { spec } = yield* appFolder;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        // Film `f` with no take yet: no `narration/` until its first mix makes it.
        const film = path.join(spec.films, 'f');
        yield* fs.makeDirectory(path.join(film, 'scenes'), { recursive: true });
        yield* fs.writeFileString(path.join(film, 'scenes', 'index.ts'), 'export {};\n');
        const { page, ask } = yield* served(spec, PageBundler.layerTest);
        yield* ask('/films/f/lab');
        expect((yield* ask('/films/f/narration/full.wav')).status).toBe(404);
        const f = { server: Option.none(), film: Option.some('f') };
        // The first build may count once a save it read in the last second: the build once that is heard.
        const settled = (yield* page.wait({ since: 0, ...f }, '1 second')).build;
        // The mix makes the folder, writes beside the track and renames, as `film mix` does.
        const narration = path.join(film, 'narration');
        const mixed = yield* Effect.andThen(
          Effect.gen(function* () {
            yield* fs.makeDirectory(narration, { recursive: true });
            yield* fs.writeFileString(path.join(narration, 'full.wav.partial'), 'mix one');
            yield* fs.rename(
              path.join(narration, 'full.wav.partial'),
              path.join(narration, 'full.wav'),
            );
          }),
          page.wait({ since: settled, ...f }, '5 seconds'),
        );
        expect(mixed.build).toBeGreaterThan(settled);
        expect((yield* ask('/films/f/narration/full.wav')).text).toBe('mix one');
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live("one film's mix wakes its own page's wait, never another film's", () =>
    Effect.gen(function* () {
      const { spec } = yield* appFolder;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      // Films `f` and `g`, each with a track, each played by a page.
      for (const name of ['f', 'g']) {
        const film = path.join(spec.films, name);
        yield* fs.makeDirectory(path.join(film, 'scenes'), { recursive: true });
        yield* fs.makeDirectory(path.join(film, 'narration'), { recursive: true });
        yield* fs.writeFileString(path.join(film, 'scenes', 'index.ts'), 'export {};\n');
        yield* fs.writeFileString(path.join(film, 'narration', 'full.wav'), `${name} one`);
      }
      const { page, ask } = yield* served(spec, PageBundler.layerTest);
      for (const name of ['f', 'g']) {
        yield* ask(`/films/${name}/lab`);
        expect((yield* ask(`/films/${name}/narration/full.wav`)).text).toBe(`${name} one`);
      }
      const of = (name: string) => ({ server: Option.none(), film: Option.some(name) });
      // The first build may count once a save it read in the last second: the build once that is heard.
      const settled = (yield* page.wait({ since: 0, ...of('f') }, '1 second')).build;
      const narration = path.join(spec.films, 'g', 'narration');
      yield* fs.writeFileString(path.join(narration, 'full.wav.partial'), 'g two');
      const forG = yield* Effect.andThen(
        fs.rename(path.join(narration, 'full.wav.partial'), path.join(narration, 'full.wav')),
        page.wait({ since: settled, ...of('g') }, '5 seconds'),
      );
      expect(forG.build).toBeGreaterThan(settled);
      // F's page, stamped before g's mix, still waits: its wait holds, and answers nothing newer.
      const forF = yield* page.wait({ since: settled, ...of('f') }, '1 second');
      expect(forF.build).toBe(settled);
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
    'a wedge builds the pages with a file read as other text, served by its id, the file unwritten',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { ask, page, script, scriptOf, spec } = yield* app;
        const shared = yield* fs.realPath(
          path.join(path.dirname(spec.pages.review), 'lib', 'shared.ts'),
        );
        const swapped = new Map([[shared, "export const shared = 'shared swapped';\n"]]);
        const wedged = yield* page.wedge(swapped);
        expect(wedged.failed).toEqual(Option.none());
        expect(wedged.wedge).not.toBe('');
        const html = (yield* ask(`/?wedge=${wedged.wedge}`)).text;
        expect(html).toContain(`src="/wedge/${wedged.wedge}/`);
        expect(yield* scriptOf(`/?wedge=${wedged.wedge}`)).toContain('shared swapped');
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

  it.live("a build that fails is the look's failure, in the bundler's words", () =>
    Effect.gen(function* () {
      const { ask, page, write } = yield* app;
      yield* ask('/');
      yield* write('src/p.ts', "import './missing.ts';\n");
      const now = yield* page.built;
      expect(Option.getOrElse(now.failed, () => '')).toContain('missing.ts');
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
      const heard = yield* page.wait(
        { since, server: Option.none(), film: Option.none() },
        '5 seconds',
      );
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
    'a page that failed for a file in a folder no build read: its wait alone builds again, hears the fix, and the page then serves',
    () =>
      Effect.gen(function* () {
        const { spec, write } = yield* appFolder;
        // The bundler names the importer (src/p.ts), never lib/, where the fix lands.
        yield* write('src/p.ts', "import { gone } from '../lib/missing.ts';\nconsole.log(gone);\n");
        const { page, ask } = yield* served(spec, PageBundler.layer);
        const broken = yield* ask('/');
        expect(broken.status).toBe(500);
        const since = buildOf(broken.text);
        // The failed page's wait, as its own script asks it; no page is asked meanwhile.
        const waiting = yield* Effect.forkChild(
          page.wait({ since, server: Option.none(), film: Option.none() }, '5 seconds'),
        );
        yield* write('lib/missing.ts', "export const gone = 'made';\n");
        const heard = yield* Fiber.join(waiting);
        expect(heard.build).toBeGreaterThan(since);
        // The page it reloads onto, asked once: the build the wait made, served.
        const fixed = yield* ask('/');
        expect([fixed.status, buildOf(fixed.text)]).toEqual([200, heard.build]);
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    'a failed page whose next build would build, with no save to hear, is woken by its wait building again',
    () =>
      Effect.gen(function* () {
        const { spec } = yield* appFolder;
        // The bundler fails its first two builds and builds the third, whatever the files:
        // as Bun's resolver did, holding a folder as a failed build listed it a moment ago.
        const bundles = yield* Ref.make(0);
        const flaky = Layer.effect(
          PageBundler,
          Effect.gen(function* () {
            const bundler = yield* PageBundler;
            return PageBundler.of({
              bundle: (entries, root, how) =>
                Effect.flatMap(
                  Ref.updateAndGet(bundles, (n) => n + 1),
                  (n) => {
                    if (n <= 2) return Effect.fail({ reason: `stale resolve ${n}`, files: [] });
                    return bundler.bundle(entries, root, how);
                  },
                ),
            });
          }),
        ).pipe(Layer.provide(PageBundler.layerTest));
        const { page, ask } = yield* served(spec, flaky);
        const broken = yield* ask('/');
        expect([broken.status, broken.text.includes('stale resolve 1')]).toEqual([500, true]);
        const since = buildOf(broken.text);
        // The failed page's wait, as its own script asks it; nothing is saved, no page asked.
        const heard = yield* page.wait(
          { since, server: Option.none(), film: Option.none() },
          '5 seconds',
        );
        expect(heard.build).toBeGreaterThan(since);
        const fixed = yield* ask('/');
        expect([fixed.status, buildOf(fixed.text)]).toEqual([200, heard.build]);
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live('a file the page newly reads, saved while it builds, is heard', () =>
    Effect.gen(function* () {
      const { spec, write } = yield* appFolder;
      const path = yield* Path.Path;
      const dir = path.dirname(spec.pages.review);
      // A bundler whose reads are scripted: the entries and `graph`, and `during` once, mid-build.
      const graph = yield* Ref.make<ReadonlyArray<string>>([path.join(dir, 'src', 'p.ts')]);
      const during = yield* Ref.make<Effect.Effect<void>>(Effect.void);
      const scripted = Layer.effect(
        PageBundler,
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          return PageBundler.of({
            bundle: (entries, root) =>
              Effect.gen(function* () {
                const outputs = yield* Effect.forEach(entries, (entry) =>
                  Effect.map(fs.readFile(entry), (bytes) => ({
                    path: path.relative(root, entry),
                    bytes,
                    type: 'text/html;charset=utf-8',
                  })),
                );
                yield* Effect.flatten(Ref.getAndSet(during, Effect.void));
                return { outputs, inputs: [...entries, ...(yield* Ref.get(graph))] };
              }).pipe(Effect.mapError((error) => ({ reason: error.message, files: [] }))),
          });
        }),
      );
      const { page, ask } = yield* served(spec, scripted);
      yield* ask('/');
      // The first build may count once a save it read in the last second: the build once that is heard.
      const settled = (yield* page.wait(
        { since: 0, server: Option.none(), film: Option.none() },
        '1 second',
      )).build;
      // p.ts now imports src/new.ts, in a folder already watched; new.ts is saved as the
      // next build reads it, and its save is judged against the build before, which did not read it.
      yield* write('src/new.ts', 'export const v = 1;\n');
      yield* Ref.set(graph, [path.join(dir, 'src', 'p.ts'), path.join(dir, 'src', 'new.ts')]);
      const imports = yield* Effect.andThen(
        write('src/p.ts', "import { v } from './new.ts';\nconsole.log(v);\n"),
        page.wait({ since: settled, server: Option.none(), film: Option.none() }, '5 seconds'),
      );
      expect(imports.build).toBeGreaterThan(settled);
      yield* Ref.set(
        during,
        Effect.andThen(
          write('src/new.ts', 'export const v = 2;\n'),
          Effect.sleep('300 millis'),
        ).pipe(Effect.orDie),
      );
      const second = buildOf((yield* ask('/')).text);
      const heard = yield* page.wait(
        { since: second, server: Option.none(), film: Option.none() },
        '3 seconds',
      );
      expect(heard.build).toBeGreaterThan(second);
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

/**
 * The app's three pages in a file system in memory (no watch hears a save
 * there), each page its HTML as written (`PageBundler.layerTest`); `mtimes`
 * says each file's mtime as its stat reports it (0 unless set).
 */
const memoryApp = (mtimes: Map<string, number> = new Map()) => {
  const files = new Map<string, Uint8Array>([
    ['/app/review.html', text(html('review old', './src/p.ts'))],
    ['/app/lab.html', text(html('lab', './src/lab.ts'))],
    ['/app/sub/player.html', text(html('player', '../src/play.ts'))],
  ]);
  const spec = {
    pages: {
      review: '/app/review.html',
      lab: '/app/lab.html',
      player: '/app/sub/player.html',
    },
    films: '/app/src/films',
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

describe("a look's build, against saves no watch hears", () => {
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
