// The CSS that holds a page's first paint, as the lab answers the page: the
// app's pages (`LAB_PAGES`, `LAB_SERVERS`) built and rendered on the server
// as the lab builds and renders them (`LabPage`, `PageBundler`,
// `PageRenderer`), and every stylesheet the answered head links and every
// style the page holds weighed (`blockingCss`): the server's render's head is
// the one it renders, whatever adds to it, and a place's own styles
// (`PlaceStyle`) ride in its markup, ahead of what they draw. A phone on slow 4G paints nothing
// until it has them all, so every place is held to one budget. The faces a
// film draws in are no stylesheet's: the films' loaders add them
// (`player/face.ts`).

import { BunHttpPlatform, BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, FileSystem, Layer, Option, Struct } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import { Place } from '@bible/url-state';
import { LAB_PAGES, LAB_SERVERS } from '../../../../apps/animations/server.ts';
import { Places } from '../core/api.ts';
import { PLACE_HREFS } from '../lab/fixtures/places.ts';
import { LabPage, PageBundler } from './lab-page.ts';
import { PageReads } from './api-server.ts';
import { PageRenderer } from './page-render.ts';

/**
 * The most a page's render-blocking CSS may weigh, in bytes, as built
 * (minified, before compression). Set at the heaviest place's 54 KB and a
 * fifth more, rounded to 64 KiB: a third of a second of slow 4G (1.6 Mb/s)
 * at most. A page that needs more trims its styles, or moves what no first
 * paint shows out of its head. Were the faces the films draw in a linked
 * stylesheet's, the bundler would inline them: 1.19 MB.
 *
 * On 2026-10-15 the heaviest places, Scenes, a scene and Play, held 64,673 B,
 * 863 B under it: Play's own styles with the UI face's rule (39.9 KB) and the
 * tokens and the player's (24.8 KB). The Lab's six places held 63,641 B; the
 * review's 53,726 B, its own styles (49.9 KB) and its tokens (3.8 KB), plus a
 * place's own (`PlaceStyle`: the draft's 5.8 KB, Project's 3.7 KB). Each
 * pass prints every place's weight and margin (`page.css.weighed`).
 */
const BUDGET = 64 * 1024;

/**
 * The places that carry their own styles (`PlaceStyle`): each holds them
 * ahead of its reads, so they are weighed with none answered.
 */
const OWN_STYLES: ReadonlyArray<keyof typeof PLACE_HREFS> = [
  'production',
  'ask',
  'draft',
  'draftBeat',
  'project',
];

/** A tag's attribute, as the bundler writes it (quoted or not). */
const attribute = (tag: string, name: string): string =>
  new RegExp(`\\b${name}=(?:"([^"]*)"|([^\\s>]+))`).exec(tag)?.slice(1).join('') ?? '';

/**
 * A page's render-blocking CSS, in bytes: each stylesheet its head (`html`
 * up to its `</head>`) links, by its size as the lab answers its path
 * (`size`), and each style the page holds, in its head or with a place's
 * markup (`PlaceStyle`), which holds back the paint of all that follows it.
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
      html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g),
      (m) => new TextEncoder().encode(m[1] ?? '').byteLength,
    );
    return [...linked, ...held].reduce((sum, bytes) => sum + bytes, 0);
  });

/** The bytes of a place's own styles in `html` (`PlaceStyle`). */
const placeCss = (html: string): number =>
  Array.from(
    html.matchAll(/<style\b[^>]*\bdata-place-style\b[^>]*>([\s\S]*?)<\/style>/g),
    (m) => new TextEncoder().encode(m[1] ?? '').byteLength,
  ).reduce((sum, bytes) => sum + bytes, 0);

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
            LabPage.layer({
              pages: LAB_PAGES,
              servers: LAB_SERVERS,
              films,
              footage: { dir: `${films}/footage`, out: `${films}/out` },
            }).pipe(Layer.provide([PageBundler.layer, PageRenderer.layer])),
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
        // Each link is at the place it is keyed by.
        expect(
          Struct.keys(PLACE_HREFS).filter((place) =>
            Option.isNone(Place.decode(Places[place], PLACE_HREFS[place])),
          ),
        ).toEqual([]);
        const weighed = yield* Effect.forEach(Struct.keys(PLACE_HREFS), (place) =>
          Effect.gen(function* () {
            const { status, body } = yield* ask(PLACE_HREFS[place]);
            // The server rendered it: its head holds the page's own styles.
            const rendered = status === 200 && body.includes('<style data-page-style');
            const bytes = yield* blockingCss(body, size);
            const own = placeCss(body);
            yield* Effect.logInfo(
              `page.css.weighed place=${place} bytes=${bytes} own=${own} margin=${BUDGET - bytes}`,
            );
            return { place, rendered, bytes, own };
          }),
        );
        expect(weighed.filter(({ rendered, bytes }) => !rendered || bytes > BUDGET)).toEqual([]);
        expect(weighed.filter(({ place, own }) => OWN_STYLES.includes(place) && own === 0)).toEqual(
          [],
        );
      }).pipe(
        Effect.scoped,
        Effect.provide(Layer.provideMerge(BunHttpPlatform.layer, BunServices.layer)),
      ),
  );
});
