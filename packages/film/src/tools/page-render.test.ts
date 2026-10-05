// The server's render of a page, in its build's worker: the fixture's
// server entry (`fixtures/render/page.server.tsx`), built as the lab builds
// it, renders the hydration script and its styles into the head, its markup
// into its root, and a read of the lab's API streamed in once answered; each
// build renders in a worker of its own, imported afresh; a render of an
// older build still under way finishes after a newer build renders; a page's
// head preloads and declares the UI face's latin file at the URL the
// browser's build answers; and a server entry that is no page's render fails
// its render.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import {
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Logger,
  Option,
  Path,
  Ref,
  Stream,
} from 'effect';
import * as PlatformError from 'effect/PlatformError';
import { TestClock } from 'effect/testing';
import { LONGEST_WAIT, type PageName } from '../core/api.ts';
import { PageBundler } from './lab-page.ts';
import { END_WAIT, PageRenderer, type RenderBuild, type ServerBundle } from './page-render.ts';

const Services = Layer.mergeAll(PageBundler.layer, PageRenderer.layer).pipe(
  Layer.provideMerge(BunServices.layer),
);

/** The fixture's server bundle, as the lab builds it beside its browser bundle. */
const fixtureBundle = Effect.gen(function* () {
  const path = yield* Path.Path;
  const bundler = yield* PageBundler;
  const root = path.join(import.meta.dir, 'fixtures', 'render');
  const built = yield* bundler.bundle([path.join(root, 'page.html')], root, {
    publicPath: '/',
    swaps: new Map(),
    servers: [path.join(root, 'page.server.tsx')],
  });
  return {
    files: built.server,
    entries: new Map<PageName, string>([['review', 'page.server.js']]),
  } satisfies ServerBundle;
});

const URL_ASKED = 'http://127.0.0.1:8229/sets/root/folder?view=all';

/** A read answered `text` at once. */
const answering = (text: string) => () => Effect.sync(() => new Response(text));

/** The review of `build` rendered at `URL_ASKED`, read whole. */
const renderOf = (build: RenderBuild, read: (path: string) => Effect.Effect<Response>) =>
  Effect.gen(function* () {
    const renderer = yield* PageRenderer;
    const page = yield* renderer.render(build, 'review', URL_ASKED, read);
    const markup = (yield* Stream.runCollect(page.markup)).join('');
    return { head: page.head, bodyClass: page.bodyClass, markup };
  }).pipe(Effect.scoped);

/** A logger that keeps each build the renderer logs as retired (`lab.render.worker.retired`). */
const retiredInto = (retired: Array<string>) =>
  Logger.layer([
    Logger.make(({ message }) => {
      const text = [message].flat().join(' ');
      for (const found of text.matchAll(/^lab\.render\.worker\.retired build=(\d+)/g))
        retired.push(String(found[1]));
    }),
  ]);

/**
 * A server entry whose page reads `/api/given-up` with a signal of its own,
 * gives that read up once `/api/go` is answered, and ends with what
 * `/api/kept` answers.
 */
const GIVES_UP = `
export default {
  bodyClass: 'gives-up',
  render: ({ url, fetch }, sink) => {
    sink.head('');
    const giving = new AbortController();
    fetch(new URL('/api/given-up', url), { signal: giving.signal }).catch(() => undefined);
    fetch(new URL('/api/go', url)).then(() => giving.abort());
    fetch(new URL('/api/kept', url))
      .then((response) => response.text())
      .then((text) => {
        sink.write('<p>' + text + '</p>');
        sink.end();
      });
  },
};
`;

/** A server entry whose page reads `/api/one` and writes the answer's status and text. */
const READS_ONE = `
export default {
  bodyClass: 'reads-one',
  render: ({ url, fetch }, sink) => {
    sink.head('');
    fetch(new URL('/api/one', url))
      .then((response) => response.text().then((text) => sink.write('<p>' + response.status + ' ' + text + '</p>')))
      .finally(() => sink.end());
  },
};
`;

/** A server bundle of one module, `code`, the review's entry. */
const moduleBundle = (code: string): ServerBundle => ({
  files: [{ path: 'page.js', bytes: new TextEncoder().encode(code) }],
  entries: new Map<PageName, string>([['review', 'page.js']]),
});

/**
 * The file system, its first temp folder failing to be made: a worker's
 * spawn that fails (a spawn reads the file system it is rendered with).
 */
const failingFirstTempFolder = Layer.effect(
  FileSystem.FileSystem,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const made = yield* Ref.make(0);
    return FileSystem.FileSystem.of({
      ...fs,
      makeTempDirectoryScoped: (options) =>
        Effect.flatMap(
          Ref.getAndUpdate(made, (n) => n + 1),
          (n) => {
            if (n > 0) return fs.makeTempDirectoryScoped(options);
            return Effect.fail(
              PlatformError.systemError({
                _tag: 'Unknown',
                module: 'FileSystem',
                method: 'makeTempDirectoryScoped',
                description: 'no temp folder',
              }),
            );
          },
        ),
    });
  }),
);

/** The module instance a page names: one per import of its server entry. */
const instanceOf = (markup: string) => /<p id="instance"[^>]*>([^<]+)</.exec(markup)?.[1] ?? '';

describe("a page's server render", () => {
  it.live(
    "renders in its build's worker: the hydration script and its styles in its head, its markup in its root, a read streamed in once answered",
    () =>
      Effect.gen(function* () {
        const bundle = yield* fixtureBundle;
        const reads: Array<string> = [];
        const page = yield* renderOf({ id: 1, bundle }, (path) =>
          Effect.sync(() => {
            reads.push(path);
            return new Response('the answer');
          }),
        );
        expect(page.head).toContain('_$HY');
        expect(page.head).toContain(
          '<style data-page-style>.fixture-root { display: block; }</style>',
        );
        expect(page.bodyClass).toBe('fixture');
        expect(page.markup).toMatch(/^<div class="fixture-root" data-page-root>/);
        expect(page.markup).toMatch(/<\/div>$/);
        expect(page.markup).toContain(URL_ASKED);
        expect(page.markup).toContain('the answer');
        expect(reads).toEqual(['/api/fixture?x=1']);
      }).pipe(Effect.provide(Services)),
  );

  it.live(
    "renders each build in a worker of its own: a build's module imported once, a new one's afresh",
    () =>
      Effect.gen(function* () {
        const bundle = yield* fixtureBundle;
        const first = instanceOf((yield* renderOf({ id: 1, bundle }, answering('a'))).markup);
        const again = instanceOf((yield* renderOf({ id: 1, bundle }, answering('a'))).markup);
        const next = instanceOf((yield* renderOf({ id: 2, bundle }, answering('a'))).markup);
        expect(first).not.toBe('');
        expect(again).toBe(first);
        expect(next).not.toBe(first);
      }).pipe(Effect.provide(Services)),
  );

  it.live('finishes a render of an older build under way after a newer build renders', () =>
    Effect.gen(function* () {
      const bundle = yield* fixtureBundle;
      const asked = yield* Deferred.make<void>();
      const answer = yield* Deferred.make<void>();
      const older = yield* Effect.forkChild(
        renderOf({ id: 1, bundle }, () =>
          Effect.andThen(
            Deferred.done(asked, Exit.void),
            Effect.as(Deferred.await(answer), new Response('late')),
          ),
        ),
      );
      yield* Deferred.await(asked);
      const newer = yield* renderOf({ id: 2, bundle }, answering('early'));
      expect(newer.markup).toContain('early');
      yield* Deferred.done(answer, Exit.void);
      const done = yield* Fiber.join(older);
      expect(done.markup).toContain('late');
      expect(done.markup).toMatch(/<\/div>$/);
    }).pipe(Effect.provide(Services)),
  );

  it.live(
    'retires every older build: one asked after a newer build rendered (2, then 1) once its render ends, the one before the newest when a newer renders (3)',
    () => {
      const retired: Array<string> = [];
      return Effect.gen(function* () {
        const bundle = yield* fixtureBundle;
        yield* renderOf({ id: 2, bundle }, answering('two'));
        // A request that named build 1 before build 2 rendered, answered late.
        const late = yield* renderOf({ id: 1, bundle }, answering('one'));
        expect(late.markup).toContain('one');
        expect(retired).toEqual(['1']);
        yield* renderOf({ id: 3, bundle }, answering('three'));
        expect(retired).toEqual(['1', '2']);
      }).pipe(Effect.provide(Layer.merge(Services, retiredInto(retired))));
    },
  );

  it.live('stops a held read of a render whose request is gone, as its scope closes', () =>
    Effect.gen(function* () {
      const bundle = yield* fixtureBundle;
      const asked = yield* Deferred.make<void>();
      const stopped = yield* Deferred.make<void>();
      const render = yield* Effect.forkChild(
        renderOf({ id: 1, bundle }, () =>
          Effect.andThen(Deferred.done(asked, Exit.void), Effect.never).pipe(
            Effect.onInterrupt(() => Deferred.done(stopped, Exit.void)),
          ),
        ),
      );
      yield* Deferred.await(asked);
      yield* Fiber.interrupt(render);
      const ended = yield* Deferred.await(stopped).pipe(Effect.timeoutOption('2 seconds'));
      expect(Option.isSome(ended)).toBe(true);
    }).pipe(Effect.provide(Services)),
  );

  it.live(
    "stops the handler of a read its render's fetch gives up while the render goes on, before the render closes",
    () =>
      Effect.gen(function* () {
        const bundle: ServerBundle = {
          files: [{ path: 'gives-up.js', bytes: new TextEncoder().encode(GIVES_UP) }],
          entries: new Map<PageName, string>([['review', 'gives-up.js']]),
        };
        const givenUpAsked = yield* Deferred.make<void>();
        const givenUpStopped = yield* Deferred.make<void>();
        const kept = yield* Deferred.make<void>();
        const read = (path: string) => {
          if (path === '/api/given-up')
            return Effect.andThen(Deferred.done(givenUpAsked, Exit.void), Effect.never).pipe(
              Effect.onInterrupt(() => Deferred.done(givenUpStopped, Exit.void)),
            );
          if (path === '/api/go')
            return Effect.as(Deferred.await(givenUpAsked), new Response('go'));
          return Effect.as(Deferred.await(kept), new Response('kept'));
        };
        yield* Effect.gen(function* () {
          const renderer = yield* PageRenderer;
          const page = yield* renderer.render({ id: 1, bundle }, 'review', URL_ASKED, read);
          // The render goes on, its kept read held: the given-up read's handler stops now.
          const stopped = yield* Deferred.await(givenUpStopped).pipe(
            Effect.timeoutOption('2 seconds'),
          );
          expect(Option.isSome(stopped)).toBe(true);
          yield* Deferred.done(kept, Exit.void);
          const markup = (yield* Stream.runCollect(page.markup)).join('');
          expect(markup).toBe('<p>kept</p>');
        }).pipe(Effect.scoped);
      }).pipe(Effect.provide(Services)),
  );

  it.live(
    "heads the page with the UI face's latin file, preloaded and declared, at the URL the browser's build answers it",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const bundler = yield* PageBundler;
        // A page whose script registers the face, as every page with chrome does.
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'film-face-page-' });
        yield* fs.writeFileString(
          path.join(dir, 'face.html'),
          '<!doctype html><html><head><title>face</title></head><body><script type="module" src="./face.ts"></script></body></html>',
        );
        yield* fs.writeFileString(
          path.join(dir, 'face.ts'),
          `import { registerFace } from '${path.join(import.meta.dir, '..', 'player', 'face.ts')}';\nregisterFace(document.fonts);\n`,
        );
        const browser = yield* bundler.bundle([path.join(dir, 'face.html')], dir, {
          publicPath: '/',
          swaps: new Map(),
          servers: [],
        });
        const page = yield* renderOf({ id: 1, bundle: yield* fixtureBundle }, answering('a'));
        const preloaded = Option.getOrElse(
          Option.fromNullishOr(
            /<link rel="preload" href="([^"]+)" as="font" type="font\/woff2" crossorigin>/.exec(
              page.head,
            )?.[1],
          ),
          () => '',
        );
        expect(preloaded).toMatch(/^\/jetbrains-mono-latin-wght-normal-\w+\.woff2$/);
        expect(page.head).toContain(`src:url(${preloaded}) format('woff2')`);
        expect(page.head).toContain('font-display:swap');
        expect(browser.outputs.map((file) => `/${file.path}`)).toContain(preloaded);
      }).pipe(Effect.scoped, Effect.provide(Services)),
  );

  it.live("spawns a build's worker again after its spawn failed: the failure is not kept", () =>
    Effect.gen(function* () {
      const bundle = yield* fixtureBundle;
      const failed = yield* Effect.flip(renderOf({ id: 1, bundle }, answering('a')));
      expect(failed.reason).toContain('no temp folder');
      const page = yield* renderOf({ id: 1, bundle }, answering('again'));
      expect(page.markup).toContain('again');
    }).pipe(Effect.provide(failingFirstTempFolder.pipe(Layer.provideMerge(Services)))),
  );

  it.live(
    "answers a read the lab cannot answer a 502 with why, so the render's fetch settles",
    () =>
      Effect.gen(function* () {
        const page = yield* renderOf({ id: 1, bundle: moduleBundle(READS_ONE) }, () =>
          Effect.die(new Error('the handler died')),
        ).pipe(Effect.timeoutOption('3 seconds'));
        expect(Option.map(page, (p) => p.markup)).toEqual(
          Option.some('<p>502 Error: the handler died</p>'),
        );
      }).pipe(Effect.provide(Services)),
  );

  it.effect(
    'waits out a read that takes as long as a lab request may be held (`LONGEST_WAIT`): the render ends with its answer, uncut',
    () =>
      Effect.gen(function* () {
        const asked = yield* Deferred.make<void>();
        const page = yield* Effect.forkChild(
          renderOf({ id: 1, bundle: moduleBundle(READS_ONE) }, () =>
            Effect.andThen(
              Deferred.done(asked, Exit.void),
              Effect.as(Effect.sleep(Duration.seconds(LONGEST_WAIT)), new Response('slow')),
            ),
          ),
        );
        yield* Deferred.await(asked);
        yield* TestClock.adjust(Duration.seconds(LONGEST_WAIT));
        expect((yield* Fiber.join(page)).markup).toBe('<p>200 slow</p>');
      }).pipe(Effect.provide(Services)),
  );

  it.effect(
    'cuts a render that goes on too long after its head, and stops it with the read it waits on',
    () =>
      Effect.gen(function* () {
        const asked = yield* Deferred.make<void>();
        const stopped = yield* Deferred.make<void>();
        yield* Effect.gen(function* () {
          const renderer = yield* PageRenderer;
          const page = yield* renderer.render(
            { id: 1, bundle: moduleBundle(READS_ONE) },
            'review',
            URL_ASKED,
            () =>
              Effect.andThen(Deferred.done(asked, Exit.void), Effect.never).pipe(
                Effect.onInterrupt(() => Deferred.done(stopped, Exit.void)),
              ),
          );
          const markup = yield* Effect.forkChild(Effect.flip(Stream.runDrain(page.markup)));
          yield* Deferred.await(asked);
          yield* TestClock.adjust(END_WAIT);
          expect((yield* Fiber.join(markup)).reason).toContain(
            `no end in ${Duration.format(END_WAIT)} after its head`,
          );
        }).pipe(Effect.scoped);
        // The render's scope closed with the cut: its read's handler stopped with it.
        expect(yield* Deferred.isDone(stopped)).toBe(true);
      }).pipe(Effect.provide(Services)),
  );

  it.live('fails a render whose server entry exports no page render', () =>
    Effect.gen(function* () {
      const bundle: ServerBundle = {
        files: [{ path: 'none.js', bytes: new TextEncoder().encode('export default 1;\n') }],
        entries: new Map<PageName, string>([['review', 'none.js']]),
      };
      const failed = yield* Effect.flip(renderOf({ id: 1, bundle }, answering('a')));
      expect(failed.reason).toContain('exports no PageRender');
    }).pipe(Effect.provide(Services)),
  );
});
