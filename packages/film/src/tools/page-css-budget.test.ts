// The CSS that holds a page's first paint: every stylesheet its head links,
// with the app's pages built as the lab builds them (`PageBundler`), and
// every style its head holds, the server's render's among them (the page's
// own styles, `lab/page-styles.ts`, and the UI face's rule, `FACE_HEAD`). A
// phone on slow 4G paints nothing until it has them all, so every page is
// held to one budget (`blockingCss`). The faces a film draws in are no
// stylesheet's: the films' loaders add them (`player/face.ts`).

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option, Path } from 'effect';
import { PAGE_STYLES } from '../lab/page-styles.ts';
import { FACE_HEAD } from '../player/face.ts';
import { PageBundler } from './lab-page.ts';

/**
 * The app's pages, each with what its server's render adds to its head: the
 * renderer's page has no server render; the review's, the Lab's and a film's
 * Scenes and Play pages' have.
 */
const PAGES: ReadonlyArray<readonly [page: string, server: Option.Option<string>]> = [
  ['index.html', Option.none()],
  ['review.html', Option.some(PAGE_STYLES.review)],
  ['lab.html', Option.some(PAGE_STYLES.lab)],
  ['play.html', Option.some(PAGE_STYLES.play)],
];

/**
 * The most a page's render-blocking CSS may weigh, in bytes, as built
 * (minified, before compression). The heaviest pages, the review's and
 * Play's, hold about 54 KB: the review's own styles (51 KB), its tokens
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
 * `</head>`): each stylesheet it links, by the built file of that path in
 * `files`, and each style it holds. A linked stylesheet the build did not
 * make counts as over budget.
 */
const blockingCss = (html: string, files: ReadonlyMap<string, number>): number => {
  const head = html.slice(0, Math.max(0, html.indexOf('</head>')));
  const linked = Array.from(head.matchAll(/<link\b[^>]*>/g), (m) => m[0])
    .filter((tag) => attribute(tag, 'rel') === 'stylesheet')
    .map((tag) => files.get(attribute(tag, 'href')) ?? Number.POSITIVE_INFINITY);
  const held = Array.from(
    head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g),
    (m) => new TextEncoder().encode(m[1] ?? '').byteLength,
  );
  return [...linked, ...held].reduce((sum, bytes) => sum + bytes, 0);
};

/** `html` with what a server's render adds to its head (`page-server.tsx`), as the lab splices it in. */
const withServerHead = (html: string, server: Option.Option<string>): string =>
  Option.match(server, {
    onNone: () => html,
    onSome: (style) => html.replace('</head>', `${FACE_HEAD}<style>${style}</style></head>`),
  });

describe("a page's render-blocking CSS", () => {
  it.effect.layer(Layer.provideMerge(PageBundler.layer, BunServices.layer))(
    'every page of the app holds at most the budget, as the lab builds and renders it',
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const app = path.resolve(import.meta.dir, '../../../../apps/animations');
        const bundler = yield* PageBundler;
        const built = yield* bundler
          .bundle(
            PAGES.map(([page]) => path.join(app, page)),
            app,
            { publicPath: '/', swaps: new Map(), servers: [] },
          )
          .pipe(Effect.orDie);
        const sizes = new Map(
          built.outputs.map((file) => [`/${file.path}`, file.bytes.byteLength] as const),
        );
        const weighed = PAGES.map(([page, server]) => {
          const html = Option.match(
            Option.fromUndefinedOr(built.outputs.find((file) => file.path === page)),
            { onNone: () => '', onSome: (file) => new TextDecoder().decode(file.bytes) },
          );
          return {
            page,
            built: html.length > 0,
            bytes: blockingCss(withServerHead(html, server), sizes),
          };
        });
        expect(weighed.filter(({ built: made, bytes }) => !made || bytes > BUDGET)).toEqual([]);
      }),
  );
});
