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

/** An app with one page (`/p`, `p.html` over `p.ts`) in a temp folder, and its pages over it. */
const app = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped();
  const src = path.join(dir, 'src');
  yield* fs.makeDirectory(path.join(src, 'films'), { recursive: true });
  yield* fs.writeFileString(
    path.join(dir, 'p.html'),
    '<!doctype html><html><head><title>p</title></head><body><script type="module" src="./src/p.ts"></script></body></html>',
  );
  const write = (name: string, text: string) => fs.writeFileString(path.join(src, name), text);
  yield* write('p.ts', "console.log('first');\n");
  yield* write('notes.json', '{}');
  const ctx = yield* Layer.build(
    LabPage.layer({
      pages: { '/p': path.join(dir, 'p.html') },
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
  /** The page's script, as its HTML names it. */
  const script = Effect.gen(function* () {
    const html = (yield* ask('/p')).text;
    const src = /src="\.?(\/[^"]+\.js)"/.exec(html)?.[1] ?? '';
    return (yield* ask(src)).text;
  });
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
  return { ask, script, waitWriting };
});

const buildOf = (html: string) => Number(/name="lab-build" content="(\d+)"/.exec(html)?.[1]);

describe('lab pages', () => {
  it.live(
    'a page is built when asked, stamped with its build; its script is served, nothing else',
    () =>
      Effect.gen(function* () {
        const { ask, script } = yield* app;
        const html = yield* ask('/p');
        expect([html.status, buildOf(html.text)]).toEqual([200, 0]);
        expect(yield* script).toContain('first');
        expect((yield* ask('/nothing.js')).status).toBe(404);
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    'a change to a file the page was built from wakes a wait, and the page is the new code',
    () =>
      Effect.gen(function* () {
        const { ask, script, waitWriting } = yield* app;
        yield* ask('/p');
        const { build } = yield* waitWriting(0, '10 seconds', 'p.ts', "console.log('second');\n");
        expect(build).toBeGreaterThan(0);
        expect(buildOf((yield* ask('/p')).text)).toBeGreaterThanOrEqual(build);
        expect(yield* script).toContain('second');
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live('a change to a file no build read wakes nothing', () =>
    Effect.gen(function* () {
      const { ask, waitWriting } = yield* app;
      yield* ask('/p');
      const { build } = yield* waitWriting(0, '1 second', 'notes.json', '{"seq":1}');
      expect(build).toBe(0);
    }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live('a page that does not build answers the bundler, and serves again once fixed', () =>
    Effect.gen(function* () {
      const { ask, script, waitWriting } = yield* app;
      yield* ask('/p');
      yield* waitWriting(0, '10 seconds', 'p.ts', "import './missing.ts';\n");
      const broken = yield* ask('/p');
      expect(broken.status).toBe(500);
      expect(broken.text).toContain('missing.ts');
      // The failed build read nothing new; a fix to the file it last read is still heard.
      const built = buildOf(broken.text);
      yield* waitWriting(built, '10 seconds', 'p.ts', "console.log('fixed');\n");
      expect((yield* ask('/p')).status).toBe(200);
      expect(yield* script).toContain('fixed');
    }).pipe(Effect.scoped, Effect.provide(Platform)),
  );
});
