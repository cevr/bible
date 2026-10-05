// The server's render of a page, in its build's worker: the fixture's
// server entry (`fixtures/render/page.server.tsx`), built as the lab builds
// it, renders the hydration script and its styles into the head, its markup
// into its root, and a read of the lab's API streamed in once answered; each
// build renders in a worker of its own, imported afresh; a render of an
// older build still under way finishes after a newer build renders; and a
// server entry that is no page's render fails its render.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Deferred, Effect, Exit, Fiber, Layer, Logger, Path, Stream } from 'effect';
import type { PageName } from '../core/api.ts';
import { PageBundler } from './lab-page.ts';
import { PageRenderer, type RenderBuild, type ServerBundle } from './page-render.ts';

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
