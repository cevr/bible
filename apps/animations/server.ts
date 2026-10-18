// The app's render page (`index.html`), with each film's recorded narration,
// on loopback for as long as `render` or `check` runs (the film CLI's
// PreviewServer, cli.ts, at `/?film=<name>&export`), and the pages the lab builds
// (`LAB_PAGES`). The lab's own server is the framework's (`labServer`):
// `bun run lab`.

import { CACHE, type FootageRoot, footageHandler, narrationFile } from '@bible/film/tools';
import { BunServices } from '@effect/platform-bun';
import { Effect, Option } from 'effect';
import { join } from 'node:path';
import index from './index.html';

/** The films folder: the player imports its registry, and the film CLI reads each film here. */
export const FILMS = join(import.meta.dir, 'src/films');

/**
 * The lab's pages, each this app's HTML entry: its review, its play page
 * (a film's studio), and its render page, whose
 * handle the easel draws a look through (`film look`, at a film's export
 * page). The places each is served at are the framework's (`Places`,
 * `pageAt`); `film lab` and the studio harness serve these.
 */
export const LAB_PAGES = {
  review: join(import.meta.dir, 'review.html'),
  player: join(import.meta.dir, 'play.html'),
  render: join(import.meta.dir, 'index.html'),
};

/**
 * The pages the lab renders on the server, each by its server entry: the
 * same components as its HTML entry's script, with none of the app's films
 * (the server never imports a film's modules: Fresh reads; the lab refuses
 * a build whose server entry does, `filmCode`). The player page renders
 * its shell; the film is staged in the browser. The render
 * page has no shell and no server entry: it is drawn in the browser alone.
 */
export const LAB_SERVERS: Partial<Record<keyof typeof LAB_PAGES, string>> = {
  review: join(import.meta.dir, 'src/review.server.tsx'),
  player: join(import.meta.dir, 'src/play.server.tsx'),
};

/** The loopback interface: the only one the player listens on. */
const HOST = '127.0.0.1';

/**
 * The player on `HOST`:`port`, its narration served from `films` and its
 * talks' footage from `footage` (`footageHandler`: each copy by range, as the
 * export decodes it).
 */
export const serve = (port: number, films: string, footage: FootageRoot) => {
  const spoken = narration(films);
  return Bun.serve({
    hostname: HOST,
    port,
    development: false,
    routes: {
      '/': index,
      '/films/*': (req) => spoken(new URL(req.url).pathname),
      '/footage/*': footageHandler(footage),
    },
  });
};

/**
 * The narration route, `/films/<film>/narration/<file>`, for the player: the file the framework's `narrationFile`
 * names, else a 404. The studio rewrites these files in place (a take kept,
 * the track remixed), so the browser asks again on every load rather than
 * play a take it cached.
 */
export const narration = (films: string) => (pathname: string) =>
  Effect.runPromise(
    narrationFile(films, pathname).pipe(
      Effect.map(
        Option.match({
          onNone: () => new Response('not found', { status: 404 }),
          onSome: (file) =>
            new Response(Bun.file(file), { headers: { 'Cache-Control': CACHE.fresh } }),
        }),
      ),
      Effect.provide(BunServices.layer),
    ),
  );
