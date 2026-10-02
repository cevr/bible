// The app's two servers. The player and each film's recorded narration, on
// loopback, for as long as `render` or `check` runs (the film CLI's
// PreviewServer, cli.ts); and the lab (`bun run lab`, the box's unit), whose
// every request the film framework's handler answers.

import { type LabBound, narrationFile } from '@bible/film/tools';
import { BunServices } from '@effect/platform-bun';
import { Effect, Option } from 'effect';
import { join } from 'node:path';
import index from './index.html';

/** The films folder: the player imports its registry, and the film CLI reads each film here. */
export const FILMS = join(import.meta.dir, 'src/films');

/** The loopback interface: the only one the player listens on. */
const HOST = '127.0.0.1';

type Handler = (req: Request, server: LabBound) => Response | Promise<Response>;

/** The player on `HOST`:`port`, its narration served from `films`. */
export const serve = (port: number, films: string = FILMS) => {
  const spoken = narration(films);
  return Bun.serve({
    hostname: HOST,
    port,
    development: false,
    routes: {
      '/': index,
      '/films/*': (req) => spoken(new URL(req.url).pathname),
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
            new Response(Bun.file(file), { headers: { 'Cache-Control': 'no-cache' } }),
        }),
      ),
      Effect.provide(BunServices.layer),
    ),
  );

/** Bun's longest idle timeout. A mix a page stops waiting for runs on and is found made next time. */
const LAB_IDLE_SECONDS = 255;

/**
 * The lab on `hostname`:`port`: every request goes to `lab`, the
 * framework's handler, which admits it (only the hosts it is told) before its
 * routes answer /review/* and /lab/* and its pages the rest (built from
 * `review.html`, `lab.html` and `index.html`, `LabPage`). No route here answers on its
 * own, so no path skips the Host check.
 */
export const serveLab = (port: number, hostname: string, lab: Handler) =>
  Bun.serve({
    hostname,
    port,
    development: false,
    // A film's first mix renders the whole film before it answers: as long as Bun allows.
    idleTimeout: LAB_IDLE_SECONDS,
    fetch: (req, server) => lab(req, server),
  });
