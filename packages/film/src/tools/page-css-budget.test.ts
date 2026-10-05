// The CSS that holds a page's first paint, as the lab answers the page: the
// app's pages (`LAB_PAGES`, `LAB_SERVERS`) built and rendered on the server
// as the lab builds and renders them (`LabPage`, `PageBundler`,
// `PageRenderer`), and every stylesheet the answered head links and every
// style it holds weighed (`blockingCss`): the server's render's head is the
// one it renders, whatever adds to it. A phone on slow 4G paints nothing
// until it has them all, so every place is held to one budget. The faces a
// film draws in are no stylesheet's: the films' loaders add them
// (`player/face.ts`).

import { BunHttpPlatform, BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, FileSystem, Layer } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import { LAB_PAGES, LAB_SERVERS } from '../../../../apps/animations/server.ts';
import { LabPage, PageBundler } from './lab-page.ts';
import { PageReads } from './api-server.ts';
import { PageRenderer } from './page-render.ts';

/** Each place a phone opens, by the path the lab serves it at. */
const PLACES = [
  ['Films', '/'],
  ['Choices', '/films/f/choices'],
  ['Project', '/films/f/project'],
  ['Scenes', '/films/f/scenes'],
  ['Lab', '/films/f/lab'],
  ['Play', '/films/f/play'],
] as const;

/**
 * The most a page's render-blocking CSS may weigh, in bytes, as built
 * (minified, before compression). The heaviest places, the review's and
 * Play, hold about 54 KB: the review's own styles (51 KB), its tokens
 * (2 KB) and the UI face's rule; Play's own (34 KB) and the tokens and the
 * player's (19 KB). The budget is that and a fifth more, rounded to 64 KiB:
 * room for the design language to grow a little, and a third of a second of
 * slow 4G (1.6 Mb/s) at most. A page that needs more trims its styles, or
 * moves what no first paint shows out of its head. Were the faces the films
 * draw in a linked stylesheet's, the bundler would inline them: 1.19 MB.
 */
const BUDGET = 64 * 1024;

/** A tag's attribute, as the bundler writes it (quoted or not). */
const attribute = (tag: string, name: string): string =>
  new RegExp(`\\b${name}=(?:"([^"]*)"|([^\\s>]+))`).exec(tag)?.slice(1).join('') ?? '';

/**
 * A page's render-blocking CSS, in bytes, from its head (`html` up to its
 * `</head>`): each stylesheet it links, by its size as the lab answers its
 * path (`size`), and each style it holds.
 */
const blockingCss = <R>(html: string, size: (href: string) => Effect.Effect<number, never, R>) =>
  Effect.gen(function* () {
    const head = html.slice(0, Math.max(0, html.indexOf('</head>')));
    const linked = yield* Effect.forEach(
      Array.from(head.matchAll(/<link\b[^>]*>/g), (m) => m[0]).filter(
        (tag) => attribute(tag, 'rel') === 'stylesheet',
      ),
      (tag) => size(attribute(tag, 'href')),
    );
    const held = Array.from(
      head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g),
      (m) => new TextEncoder().encode(m[1] ?? '').byteLength,
    );
    return [...linked, ...held].reduce((sum, bytes) => sum + bytes, 0);
  });

/** The page's reads of the API as it renders: none answered, so it renders without them. */
const NOTHING_READ = PageReads.of({
  read: () => Effect.succeed(new Response('{}', { status: 404 })),
});

describe("a page's render-blocking CSS", () => {
  it.live(
    'every place a phone opens holds at most the budget, as the lab builds, renders and answers it',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const films = yield* fs.makeTempDirectoryScoped({ prefix: 'film-css-budget-' });
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
            return { status: response.status, body: yield* Effect.promise(() => response.text()) };
          });
        const size = (href: string) =>
          Effect.map(ask(href), ({ status, body }) => {
            if (status !== 200) return Number.POSITIVE_INFINITY;
            return new TextEncoder().encode(body).byteLength;
          });
        const weighed = yield* Effect.forEach(PLACES, ([place, pathname]) =>
          Effect.gen(function* () {
            const { status, body } = yield* ask(pathname);
            // The server rendered it: its head holds the page's own styles.
            const rendered = status === 200 && body.includes('<style data-page-style');
            return { place, rendered, bytes: yield* blockingCss(body, size) };
          }),
        );
        expect(weighed.filter(({ rendered, bytes }) => !rendered || bytes > BUDGET)).toEqual([]);
      }).pipe(
        Effect.scoped,
        Effect.provide(Layer.provideMerge(BunHttpPlatform.layer, BunServices.layer)),
      ),
  );
});
