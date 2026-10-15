// The site as a reader meets it: the production build, answered the way the
// Worker answers it. `bun run build` runs first (turbo's `test` depends on
// `build`).
//
// Cloudflare serves the Worker assets-first, so `served` does too: a path that
// names a file in the client build is that file, with the headers
// `_headers` gives it; any other path is the Worker's `fetch`, which hands it
// to React Router (`src/server/render.ts`). `bun run test:deploy` checks the
// same answers on Cloudflare itself.

import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Path } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import { describe, expect, it } from 'effect-bun-test';
import { createRequestHandler } from 'react-router';

import * as build from '#server-build';

import { posts } from '../app/content/posts.ts';
import { respond } from '../src/server/render.ts';

const CLIENT = `${import.meta.dir}/../build/client`;

const handle = createRequestHandler(build, 'production');

/** One `_headers` rule: a path (`*` at the end matches the rest) and its headers. */
interface Rule {
  readonly path: string;
  readonly headers: Record<string, string>;
}

/** The `_headers` file the build copies from `public/`, as rules. */
const rules = Effect.fn('test.rules')(function* () {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(`${CLIENT}/_headers`);
  // A rule is a path at the start of a line, then its indented `Name: value` lines.
  return text
    .split(/\n(?=\S)/)
    .filter((block) => block.trim() !== '' && !block.startsWith('#'))
    .map((block): Rule => {
      const [path = '', ...lines] = block.split('\n').map((line) => line.trim());
      const headers: Record<string, string> = {};
      for (const line of lines.filter((l) => l !== '' && !l.startsWith('#'))) {
        const [name = '', ...value] = line.split(':');
        headers[name.trim().toLowerCase()] = value.join(':').trim();
      }
      return { path, headers };
    });
});

const matches = (rule: Rule, path: string) => {
  if (rule.path.endsWith('*')) return path.startsWith(rule.path.slice(0, -1));
  return path === rule.path;
};

/** What a reader gets for one path, assets first. */
const served = Effect.fn('test.served')(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;
  const paths = yield* Path.Path;
  const file = paths.join(CLIENT, path);
  if (path !== '/' && (yield* fs.exists(file))) {
    const headers: Record<string, string> = {};
    for (const rule of yield* rules()) {
      if (matches(rule, path)) Object.assign(headers, rule.headers);
    }
    return { from: 'asset', status: 200, headers, body: yield* fs.readFileString(file) };
  }
  const rendered = yield* respond(
    handle,
    HttpServerRequest.fromWeb(new Request(`https://triedgold.com${path}`)),
  );
  const web = HttpServerResponse.toWeb(rendered);
  return {
    from: 'worker',
    status: web.status,
    headers: Object.fromEntries(web.headers),
    body: yield* Effect.promise(() => web.text()),
  };
});

/** The old site's URLs that still answer: every one but the hidden `/events`. */
const pages = ['/', '/about', '/contact', '/blog', ...posts.map((p) => `/blog/${p.slug}`)];

/** Same-site targets a page points at: links, stylesheets, scripts, icons. */
const targets = (html: string): ReadonlyArray<string> =>
  [...html.matchAll(/(?:href|src)="(\/[^"#]*)"/g)].flatMap((match) => match.slice(1, 2));

describe('triedgold', () => {
  it.live('every page of the old site renders', () =>
    Effect.gen(function* () {
      for (const page of pages) {
        const response = yield* served(page);
        expect([page, response.from, response.status]).toEqual([page, 'worker', 200]);
        expect(response.headers['content-type']).toContain('text/html');
        expect(response.body).toContain('Tried Gold');
      }
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.live('every same-site link, stylesheet and script on every page resolves', () =>
    Effect.gen(function* () {
      const seen = new Set<string>();
      for (const page of pages) {
        const html = (yield* served(page)).body;
        for (const target of targets(html)) seen.add(target);
      }
      // The header's sections and the posts are among them, so the check
      // covers navigation, not only assets.
      expect([...seen]).toEqual(expect.arrayContaining(['/blog', '/about', '/contact']));
      for (const target of seen) {
        const response = yield* served(target);
        expect([target, response.status]).toEqual([target, 200]);
      }
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.live('the hidden events page is a 404 page, and nothing links to it', () =>
    Effect.gen(function* () {
      const events = yield* served('/events');
      expect(events.status).toBe(404);
      expect(events.body).toContain('could not be found');
      for (const page of pages) {
        const linked = targets((yield* served(page)).body).filter((t) => t.startsWith('/events'));
        expect([page, linked]).toEqual([page, []]);
      }
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.live('an unknown page or post is a 404 page', () =>
    Effect.gen(function* () {
      for (const path of ['/nope', '/blog/not-a-post']) {
        const response = yield* served(path);
        expect([path, response.status]).toEqual([path, 404]);
        expect(response.body).toContain('could not be found');
      }
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.live('hashed assets are cached for a year, the favicon for an hour', () =>
    Effect.gen(function* () {
      const html = (yield* served('/')).body;
      const asset = targets(html).find((target) => target.startsWith('/assets/'));
      expect(asset).toBeDefined();
      const hashed = yield* served(asset ?? '/assets/');
      expect([hashed.from, hashed.headers['cache-control']]).toEqual([
        'asset',
        'public, max-age=31536000, immutable',
      ]);
      const icon = yield* served('/favicon.ico');
      expect([icon.from, icon.status]).toEqual(['asset', 200]);
      expect(icon.headers['cache-control']).toBe('public, max-age=3600');
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
