// Serves the player and each film's recorded narration. `render` starts this
// in-process as the film CLI's PreviewServer (cli.ts); `bun run dev` runs it
// with hot reload; `bun run lab` runs it in development mode with the lab's
// routes (the film framework's handler) at /lab/*.

import type { LabBound } from '@bible/film/tools';
import { join, normalize } from 'node:path';
import index from './index.html';

/** The films folder: the player imports its registry, and the film CLI reads each film here. */
export const FILMS = join(import.meta.dir, 'src/films');

/**
 * The loopback interface: the only one the player listens on. The lab's routes
 * rewrite scene files, so nothing on the network may reach them.
 */
export const HOST = '127.0.0.1';

/** A wait on `/lab/notes/wait` holds up to 60 s: the connection must outlive it. */
const IDLE_SECONDS = 75;

type Handler = (req: Request, server: LabBound) => Response | Promise<Response>;

const notFound: Handler = () => new Response('not found', { status: 404 });

/** The player on `HOST`:`port`; `lab` answers `/lab/*` (the film lab's API) when the lab runs. */
export const serve = (port: number, development: boolean, lab: Handler = notFound) =>
  Bun.serve({
    hostname: HOST,
    port,
    development,
    idleTimeout: IDLE_SECONDS,
    routes: {
      '/': index,
      '/lab/*': lab,
      // Narration takes: /films/<film>/narration/<file>
      '/films/*': (req) => {
        const rel = normalize(
          decodeURIComponent(new URL(req.url).pathname.slice('/films/'.length)),
        );
        if (rel.startsWith('..') || !rel.includes('/narration/'))
          return new Response('not found', { status: 404 });
        const file = Bun.file(join(FILMS, rel));
        return file
          .exists()
          .then((ok) => (ok ? new Response(file) : new Response('not found', { status: 404 })));
      },
    },
  });

if (import.meta.main) {
  const server = serve(Number(Bun.env['PORT'] ?? 4400), true);
  console.log(`[animations] serving url=${server.url}`);
}
