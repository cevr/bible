// The render page's code is its own: the app's pages (`LAB_PAGES`) built
// together as the lab builds them (`LabPage`, `PageBundler`), and each
// studio page's scripts, as its HTML and their static imports load them,
// never hold the render page's handle (`window.__film`, `mountRender`) or the
// encoder it alone imports (`player/encode.ts`, mediabunny). A bundler splits
// the pages' code by the modules each reaches, so a studio page that reaches
// the render page's module (an entry that re-exports it beside what the films
// import) downloads the encoder on every load, a phone's too.

import { BunHttpPlatform, BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, FileSystem, Layer } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import { LAB_PAGES, LAB_SERVERS } from '../../../../apps/animations/server.ts';
import { pageHref } from '../core/api.ts';
import { LabPage, PageBundler } from './lab-page.ts';
import { PageReads } from './api-server.ts';
import { PageRenderer } from './page-render.ts';

/** A studio page at each of its places' kinds: the review, the player and the lab. */
const STUDIO = [pageHref.home(), pageHref.play('f'), pageHref.lab('f')];

/** Long enough to build the app's pages and render each studio page on the server once. */
const BUILDING = 60_000;

/** What only the render page's code says: its handle, set on the window. */
const RENDER_MARK = 'window.__film=';

/** The page's reads of the API as it renders: none answered, so it renders without them. */
const NOTHING_READ = PageReads.of({
  read: () => Effect.succeed(new Response('{}', { status: 404 })),
});

/** The scripts a page's HTML loads at once: its module entries and those it preloads. */
const headScripts = (html: string) =>
  Array.from(
    html.matchAll(/<(?:script\b[^>]*\bsrc|link\b[^>]*rel="modulepreload"[^>]*\bhref)="([^"]+)"/g),
    (m) => m[1] ?? '',
  );

/** The chunks a script imports statically (`import … from "…"`, `import "…"`), never by `import()`. */
const staticImports = (script: string) =>
  Array.from(script.matchAll(/(?:from|import)\s*"(\/[^"]+\.js)"/g), (m) => m[1] ?? '');

describe("the render page's code", () => {
  it.live(
    'no studio page loads it, as the lab builds the pages together',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const films = yield* fs.makeTempDirectoryScoped({ prefix: 'film-page-graph-' });
        const page = Context.get(
          yield* Layer.build(
            LabPage.layer({ pages: LAB_PAGES, servers: LAB_SERVERS, films }).pipe(
              Layer.provide([PageBundler.layer, PageRenderer.layer]),
            ),
          ),
          LabPage,
        );
        const ask = (pathname: string) =>
          Effect.gen(function* () {
            const request = HttpServerRequest.fromWeb(
              new Request(`http://127.0.0.1:8229${pathname}`, {
                headers: { host: '127.0.0.1:8229' },
              }),
            );
            const response = HttpServerResponse.toWeb(
              yield* page.answer.pipe(
                Effect.provideService(HttpServerRequest.HttpServerRequest, request),
                Effect.provideService(PageReads, NOTHING_READ),
              ),
            );
            return yield* Effect.promise(() => response.text());
          });
        /** Every script `href` loads at once, by path: its head's and their static imports, transitively. */
        const loaded = (href: string) =>
          Effect.gen(function* () {
            const scripts = new Map<string, string>();
            const queue = headScripts(yield* ask(href));
            // The queue grows as it is read: each script's imports join its end.
            for (const next of queue) {
              if (scripts.has(next)) continue;
              const script = yield* ask(next);
              scripts.set(next, script);
              queue.push(...staticImports(script));
            }
            return scripts;
          });
        // The render page itself holds the mark: the probe reads what it means to.
        const render = yield* loaded(pageHref.export('f'));
        expect([...render.values()].some((script) => script.includes(RENDER_MARK))).toBe(true);
        const holding = yield* Effect.forEach(STUDIO, (href) =>
          Effect.map(loaded(href), (scripts) => ({
            href,
            scripts: scripts.size,
            render: [...scripts]
              .filter(([, script]) => script.includes(RENDER_MARK))
              .map(([path]) => path),
          })),
        );
        expect(holding.filter((p) => p.scripts === 0 || p.render.length > 0)).toEqual([]);
      }).pipe(
        Effect.scoped,
        Effect.provide(Layer.provideMerge(BunHttpPlatform.layer, BunServices.layer)),
      ),
    BUILDING,
  );
});
