// The site as a reader meets it: the production build, served by the routes
// every host mounts, fetched over real HTTP. `bun run build` runs first (turbo's
// `test` depends on `build`).

import { BunHttpServer } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';
import { HttpClient, HttpRouter } from 'effect/http';
import { describe, expect, it } from 'effect-bun-test';

import * as build from '#server-build';

import { posts } from '../app/content/posts.ts';
import * as Site from '../src/server/site.ts';

const Served = HttpRouter.serve(Site.layer(build, `${import.meta.dir}/../build/client`)).pipe(
  Layer.provideMerge(BunHttpServer.layerTest),
);

const get = Effect.fn('test.get')(function* (path: string) {
  const response = yield* HttpClient.get(path);
  return { status: response.status, headers: response.headers, body: yield* response.text };
});

/** The old site's URLs: each must still answer. */
const pages = [
  '/',
  '/about',
  '/contact',
  '/events',
  '/blog',
  ...posts.map((p) => `/blog/${p.slug}`),
];

/** Same-site targets a page points at: links, stylesheets, scripts, icons. */
const targets = (html: string): ReadonlyArray<string> =>
  [...html.matchAll(/(?:href|src)="(\/[^"#]*)"/g)].flatMap((match) => match.slice(1, 2));

describe('triedgold', () => {
  it.live('every page of the old site renders', () =>
    Effect.gen(function* () {
      for (const page of pages) {
        const response = yield* get(page);
        expect([page, response.status]).toEqual([page, 200]);
        expect(response.headers['content-type']).toContain('text/html');
        expect(response.body).toContain('Tried Gold');
      }
    }).pipe(Effect.provide(Served)),
  );

  it.live('every same-site link, stylesheet and script on every page resolves', () =>
    Effect.gen(function* () {
      const seen = new Set<string>();
      for (const page of pages) {
        const html = (yield* get(page)).body;
        for (const target of targets(html)) seen.add(target);
      }
      // The header's sections and the posts are among them, so the check
      // covers navigation, not only assets.
      expect([...seen]).toEqual(expect.arrayContaining(['/events', '/blog', '/about', '/contact']));
      for (const target of seen) {
        const response = yield* get(target);
        expect([target, response.status]).toEqual([target, 200]);
      }
    }).pipe(Effect.provide(Served)),
  );

  it.live('an unknown page or post is a 404 page', () =>
    Effect.gen(function* () {
      for (const path of ['/nope', '/blog/not-a-post']) {
        const response = yield* get(path);
        expect([path, response.status]).toEqual([path, 404]);
        expect(response.body).toContain('could not be found');
      }
    }).pipe(Effect.provide(Served)),
  );

  it.live('hashed assets are cached for a year, other files for an hour', () =>
    Effect.gen(function* () {
      const html = (yield* get('/')).body;
      const asset = targets(html).find((target) => target.startsWith('/assets/'));
      expect(asset).toBeDefined();
      const hashed = yield* get(asset ?? '/assets/');
      expect(hashed.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      const icon = yield* get('/favicon.ico');
      expect(icon.status).toBe(200);
      expect(icon.headers['cache-control']).toBe('public, max-age=3600');
    }).pipe(Effect.provide(Served)),
  );

  it.live('answers the health check', () =>
    Effect.gen(function* () {
      const response = yield* get('/health');
      expect([response.status, response.body]).toEqual([200, 'ok']);
    }).pipe(Effect.provide(Served)),
  );
});
