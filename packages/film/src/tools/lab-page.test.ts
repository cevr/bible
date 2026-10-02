// The lab's pages as a browser and an editor meet them: a page is built when
// first asked and stamped with its build; a change to a file it was built from
// wakes a waiting page and the next ask is the new code; a change to anything
// else (a render, a note) wakes nothing; a page that does not build answers
// the bundler's words and serves again once fixed.

import { BunHttpPlatform, BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Context, type Duration, Effect, FileSystem, Layer, Path, Schedule } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import { LabPage } from './lab-page.ts';

const Platform = Layer.provideMerge(BunHttpPlatform.layer, BunServices.layer);

/**
 * An app in a temp folder: its review (`review.html` over `p.ts`), its lab
 * and its player (`sub/player.html`, an entry below the others), and its
 * pages over it.
 */
const app = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped();
  const src = path.join(dir, 'src');
  yield* fs.makeDirectory(path.join(src, 'films'), { recursive: true });
  yield* fs.makeDirectory(path.join(dir, 'sub'), { recursive: true });
  const html = (title: string, script: string) =>
    `<!doctype html><html><head><title>${title}</title></head><body><script type="module" src="${script}"></script></body></html>`;
  yield* fs.writeFileString(path.join(dir, 'review.html'), html('review', './src/p.ts'));
  yield* fs.writeFileString(path.join(dir, 'lab.html'), html('lab', './src/lab.ts'));
  yield* fs.writeFileString(path.join(dir, 'sub', 'player.html'), html('player', '../src/play.ts'));
  const write = (name: string, text: string) => fs.writeFileString(path.join(src, name), text);
  yield* write('p.ts', "console.log('first');\n");
  yield* write('lab.ts', "console.log('the lab');\n");
  yield* write('play.ts', "console.log('the player');\n");
  yield* write('notes.json', '{}');
  const ctx = yield* Layer.build(
    LabPage.layer({
      pages: {
        review: path.join(dir, 'review.html'),
        lab: path.join(dir, 'lab.html'),
        player: path.join(dir, 'sub', 'player.html'),
      },
      sources: [src],
      films: path.join(src, 'films'),
    }),
  );
  const page = Context.get(ctx, LabPage);
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
  /** The script of the page `pathname` serves, as its HTML names it. */
  const scriptOf = (pathname: string) =>
    Effect.gen(function* () {
      const html = (yield* ask(pathname)).text;
      const src = /src="\.?(\/[^"]+\.js)"/.exec(html)?.[1] ?? '';
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
      page.wait(since, timeout),
      write(name, text).pipe(
        Effect.repeat(Schedule.spaced('200 millis')),
        Effect.andThen(Effect.never),
      ),
    );
  return { ask, script, scriptOf, waitWriting };
});

const buildOf = (html: string) => Number(/name="lab-build" content="(\d+)"/.exec(html)?.[1]);

describe('lab pages', () => {
  it.live(
    'a page is built when asked, stamped with its build; its script is served, nothing else',
    () =>
      Effect.gen(function* () {
        const { ask, script } = yield* app;
        const html = yield* ask('/');
        expect([html.status, buildOf(html.text)]).toEqual([200, 0]);
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
        const html = (yield* ask('/films/f/lab/hand')).text;
        expect(html).toMatch(/src="\/[^"]+\.js"/);
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
        const { build } = yield* waitWriting(0, '10 seconds', 'p.ts', "console.log('second');\n");
        expect(build).toBeGreaterThan(0);
        expect(buildOf((yield* ask('/')).text)).toBeGreaterThanOrEqual(build);
        expect(yield* script).toContain('second');
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live('a change to a file no build read wakes nothing', () =>
    Effect.gen(function* () {
      const { ask, waitWriting } = yield* app;
      yield* ask('/');
      const { build } = yield* waitWriting(0, '1 second', 'notes.json', '{"seq":1}');
      expect(build).toBe(0);
    }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live('a page that does not build answers the bundler, and serves again once fixed', () =>
    Effect.gen(function* () {
      const { ask, script, waitWriting } = yield* app;
      yield* ask('/');
      yield* waitWriting(0, '10 seconds', 'p.ts', "import './missing.ts';\n");
      const broken = yield* ask('/');
      expect(broken.status).toBe(500);
      expect(broken.text).toContain('missing.ts');
      // The failed build read nothing new; a fix to the file it last read is still heard.
      const built = buildOf(broken.text);
      yield* waitWriting(built, '10 seconds', 'p.ts', "console.log('fixed');\n");
      expect((yield* ask('/')).status).toBe(200);
      expect(yield* script).toContain('fixed');
    }).pipe(Effect.scoped, Effect.provide(Platform)),
  );
});
