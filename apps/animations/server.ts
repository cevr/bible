// Serves the player and each film's recorded narration. `render` starts this
// in-process as the film CLI's PreviewServer (cli.ts); `bun run dev` runs it
// with hot reload; `bun run lab` runs it in development mode with the lab's
// page at /lab and its routes (the film framework's handler) at /lab/*.

import type { LabBound } from '@bible/film/tools';
import { Option } from 'effect';
import { join, normalize } from 'node:path';
import index from './index.html';
import labPage from './lab.html';
import reviewPage from './review.html';

/** The films folder: the player imports its registry, and the film CLI reads each film here. */
export const FILMS = join(import.meta.dir, 'src/films');

/**
 * The loopback interface: the only one the player listens on. The lab's routes
 * rewrite scene files, so nothing on the network may reach them.
 */
export const HOST = '127.0.0.1';

/** A wait on `/lab/<film>/notes/wait` holds up to 60 s: the connection must outlive it. */
const IDLE_SECONDS = 75;
/** Bun's longest idle timeout. A mix a page stops waiting for runs on and is found made next time. */
const REVIEW_IDLE_SECONDS = 255;

type Handler = (req: Request, server: LabBound) => Response | Promise<Response>;

const notFound: Handler = () => new Response('not found', { status: 404 });

/**
 * The lab's page (`/lab?film=…`, its Solid panels) and its API (`/lab/<film>/…`)
 * when the lab runs; otherwise neither, so the render's server never bundles
 * the lab page.
 */
const labRoutes = (lab: Option.Option<Handler>) => ({
  '/lab': Option.match(lab, { onNone: () => notFound, onSome: () => labPage }),
  '/lab/*': Option.getOrElse(lab, () => notFound),
});

/**
 * The player on `HOST`:`port`; with `lab` (the film lab's API), the lab's
 * page and routes too. The narration is served from `films` (a test's copy
 * of the films folder, so the studio's writes never touch the real one).
 */
export const serve = (port: number, development: boolean, lab?: Handler, films: string = FILMS) =>
  Bun.serve({
    hostname: HOST,
    port,
    development,
    idleTimeout: IDLE_SECONDS,
    routes: {
      '/': index,
      ...labRoutes(Option.fromUndefinedOr(lab)),
      '/films/*': narration(films),
    },
  });

/**
 * Narration takes: /films/<film>/narration/<file>. The studio rewrites them
 * in place (a take kept, the track remixed), so the browser asks again on
 * every load rather than play a take it cached.
 */
const narration =
  (films: string): Handler =>
  (req) => {
    const rel = normalize(decodeURIComponent(new URL(req.url).pathname.slice('/films/'.length)));
    if (rel.startsWith('..') || !rel.includes('/narration/'))
      return new Response('not found', { status: 404 });
    const file = Bun.file(join(films, rel));
    return file
      .exists()
      .then((ok) =>
        ok
          ? new Response(file, { headers: { 'Cache-Control': 'no-cache' } })
          : new Response('not found', { status: 404 }),
      );
  };

/**
 * The review on `hostname`:`port`: its page at / (a folder, a set or a view
 * is in the query), its routes (the framework's handler, which answers only
 * the hosts it is told) at /review/* and each film's options at /lab/*, and
 * the narration its film pages play. No scene editor, no studio.
 */
export const serveReview = (port: number, hostname: string, review: Handler, films: string) =>
  Bun.serve({
    hostname,
    port,
    development: false,
    // A film's first mix renders the whole film before it answers: as long as Bun allows.
    idleTimeout: REVIEW_IDLE_SECONDS,
    routes: {
      '/': reviewPage,
      '/review/*': review,
      '/lab/*': review,
      '/films/*': narration(films),
    },
  });

if (import.meta.main) {
  const server = serve(Number(Bun.env['PORT'] ?? 4400), true);
  console.log(`[animations] serving url=${server.url}`);
}
