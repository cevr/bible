// The player's server listens on the loopback interface only: the lab's API
// rewrites scene files, so nothing on the network may reach it. Both servers
// the CLI starts (the render's, on any free port, and the lab's) come from
// `serve`. The review's page is built in this process and answered by a
// handler (`reviewPage`), so the review's `admit` stands in front of it.

import { BunServices } from '@effect/platform-bun';
import type { LabHandler } from '@bible/film/tools';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import { FILMS, narration, reviewPage, serve } from '../server.ts';

/** The server `serve` starts, stopped when the test's scope closes. */
const served = (development: boolean) =>
  Effect.acquireRelease(
    Effect.sync(() => serve(0, development)),
    (server) => Effect.promise(() => server.stop(true)),
  );

describe('serve', () => {
  it.live('binds 127.0.0.1, never every interface', () =>
    Effect.gen(function* () {
      for (const development of [false, true]) {
        const server = yield* served(development);
        expect(server.hostname).toBe('127.0.0.1');
        expect(server.url.hostname).toBe('127.0.0.1');
      }
    }).pipe(Effect.scoped),
  );

  it.live(
    'serves the narration uncached: the studio rewrites a take and its timings in place',
    () =>
      Effect.gen(function* () {
        const server = yield* served(false);
        const res = yield* HttpClient.get(
          new URL('/films/righteousness-by-faith/narration/timings.json', server.url),
        );
        expect(res.status).toBe(200);
        expect(res.headers['cache-control']).toBe('no-cache');
      }).pipe(Effect.scoped, Effect.provide(FetchHttpClient.layer)),
  );

  it.live(
    "answers only a film's own narration files: no other film, no attempts, no path, no dotfile",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const films = yield* fs.makeTempDirectoryScoped({ prefix: 'narration-' });
        yield* fs.makeDirectory(path.join(films, 'f/narration/attempts'), { recursive: true });
        for (const file of ['timings.json', 'attempts/a.wav', '.hidden'])
          yield* fs.writeFileString(path.join(films, 'f/narration', file), '{}');
        const spoken = narration(films);
        const status = (url: string) =>
          Effect.map(
            Effect.promise(() => spoken(url)),
            (res) => [url, res.status],
          );
        expect(
          yield* Effect.all([
            status('/films/f/narration/timings.json'),
            status('/films/nope/narration/timings.json'),
            status('/films/f/narration/attempts/a.wav'),
            status('/films/f/narration/attempts%2Fa.wav'),
            status('/films/f/narration/.hidden'),
          ]),
        ).toEqual([
          ['/films/f/narration/timings.json', 200],
          ['/films/nope/narration/timings.json', 404],
          ['/films/f/narration/attempts/a.wav', 404],
          ['/films/f/narration/attempts%2Fa.wav', 404],
          ['/films/f/narration/.hidden', 404],
        ]);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});

/** `path` asked of the review's page, as the review's handler asks it once admitted. */
const ask = (page: LabHandler, path: string) =>
  Effect.promise(() =>
    page(new Request(`http://127.0.0.1:8229${path}`), { hostname: '127.0.0.1', port: 8229 }),
  );

describe('reviewPage', () => {
  it.live('builds the page and answers it, its script, and the narration', () =>
    Effect.gen(function* () {
      const page = yield* reviewPage(FILMS);
      const html = yield* ask(page, '/');
      expect(html.status).toBe(200);
      expect(html.headers.get('cache-control')).toBe('no-cache');
      const text = yield* Effect.promise(() => html.text());
      const script = Option.getOrElse(
        Option.fromNullishOr(/src="\.(\/chunk-[^"]+\.js)"/.exec(text)?.[1]),
        () => 'no script in the page',
      );
      const js = yield* ask(page, script);
      expect([script, js.status]).toEqual([script, 200]);
      expect(js.headers.get('cache-control')).toBe('max-age=31536000, immutable');
      const timings = yield* ask(page, '/films/righteousness-by-faith/narration/timings.json');
      expect(timings.status).toBe(200);
      expect((yield* ask(page, '/films/../package.json')).status).toBe(404);
      expect((yield* ask(page, '/chunk-none.js')).status).toBe(404);
    }),
  );
});
