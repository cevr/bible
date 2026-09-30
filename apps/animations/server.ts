// Serves the player and each film's recorded narration. `render` starts this
// in-process as the film CLI's PreviewServer (cli.ts); `bun run dev` runs it
// with hot reload; `bun run lab` runs it in development mode with the lab's
// page at /lab and its routes (the film framework's handler) at /lab/*.

import { type LabBound, type LabHandler, ReviewPageFailed } from '@bible/film/tools';
import { Effect, Option } from 'effect';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import index from './index.html';
import labPage from './lab.html';

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
export const serve = (port: number, development: boolean, lab?: Handler, films: string = FILMS) => {
  const spoken = narration(films);
  return Bun.serve({
    hostname: HOST,
    port,
    development,
    idleTimeout: IDLE_SECONDS,
    routes: {
      '/': index,
      ...labRoutes(Option.fromUndefinedOr(lab)),
      '/films/*': (req) => spoken(new URL(req.url).pathname),
    },
  });
};

/** A narration URL: `/films/<film>/narration/<file>`, the file directly in the folder. */
const NARRATION_URL = /^\/films\/([^/]+)\/narration\/([^/]+)$/;

/** A file name as it may sit in a narration folder: no path, no dotfile. */
const NARRATION_FILE = /^[\w-][\w.-]*$/;

/** The app's films: the folders under `films` (read once, when the server starts). */
const filmsIn = (films: string): ReadonlySet<string> =>
  new Set(
    readdirSync(films, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );

/** The file a narration URL names, when its film is one of `known` and its name a plain file's. */
const narrationFile = (films: string, known: ReadonlySet<string>, pathname: string) =>
  Option.flatMap(Option.fromNullishOr(NARRATION_URL.exec(pathname)), ([, film, file]) =>
    Option.filter(
      Option.all([Option.fromUndefinedOr(film), Option.fromUndefinedOr(file)]),
      ([f, n]) => known.has(f) && NARRATION_FILE.test(n),
    ).pipe(Option.map(([f, n]) => join(films, f, 'narration', n))),
  );

/**
 * The narration route, `/films/<film>/narration/<file>`, for the player, the
 * lab and the review page alike: the film one of the app's films, the file
 * one directly in its `narration/` (never `attempts/`, never a path). Any
 * other name is a 404 before the disk is read. The studio rewrites these
 * files in place (a take kept, the track remixed), so the browser asks again
 * on every load rather than play a take it cached.
 */
export const narration = (films: string) => {
  const known = filmsIn(films);
  const answer = (pathname: string) =>
    Option.match(narrationFile(films, known, pathname), {
      onNone: () => Effect.succeed(new Response('not found', { status: 404 })),
      onSome: (path) =>
        Effect.gen(function* () {
          const file = Bun.file(path);
          if (!(yield* Effect.promise(() => file.exists())))
            return new Response('not found', { status: 404 });
          return new Response(file, { headers: { 'Cache-Control': 'no-cache' } });
        }),
    });
  return (pathname: string) => Effect.runPromise(answer(pathname));
};

/** The review page's source, built in this process (`reviewPage`). */
const REVIEW_HTML = join(import.meta.dir, 'review.html');

/** The built review page by the path it is asked for: `/` its HTML, `/chunk-….js` its script. */
type BuiltPage = ReadonlyMap<string, Blob>;

/** A built file's path as the page asks for it (`./review.html` is `/`). */
const pagePath = (file: string) => {
  const name = file.replace(/^\.\//, '');
  if (name === 'review.html') return '/';
  return `/${name}`;
};

/**
 * The review page, its script bundled with the lab's Solid plugin as the page
 * server bundles an HTML import, but in this process: each file is then
 * answered by a handler behind the review's `admit`, not by a route Bun
 * serves on its own.
 */
const buildReviewPage = Effect.gen(function* () {
  const { solidPlugin } = yield* Effect.promise(() => import('@bible/film/solid-plugin'));
  const out = yield* Effect.tryPromise({
    try: () =>
      Bun.build({
        entrypoints: [REVIEW_HTML],
        plugins: [solidPlugin],
        target: 'browser',
        minify: true,
      }),
    catch: (cause) => ReviewPageFailed.make({ reason: String(cause) }),
  });
  if (!out.success)
    return yield* ReviewPageFailed.make({ reason: out.logs.map(String).join('; ') });
  return new Map(out.outputs.map((file) => [pagePath(file.path), file])) satisfies BuiltPage;
});

/** A built file, the HTML asked again each load, the script (named by its hash) kept. */
const builtFile = (files: BuiltPage, pathname: string) =>
  Option.match(Option.fromUndefinedOr(files.get(pathname)), {
    onNone: () => new Response('not found', { status: 404 }),
    onSome: (file) => {
      if (pathname === '/') return new Response(file, { headers: { 'Cache-Control': 'no-cache' } });
      return new Response(file, { headers: { 'Cache-Control': 'max-age=31536000, immutable' } });
    },
  });

/**
 * What the review serves beside its routes, once its handler has admitted the
 * request: its page at / (a folder, a set or a film is in the query), the
 * page's script, and the narration its film pages play. Built when `review`
 * starts, so a page that does not build stops the command
 * (`ReviewPageFailed`) rather than a request.
 */
export const reviewPage = (films: string) =>
  Effect.map(buildReviewPage, (files): LabHandler => {
    const spoken = narration(films);
    return (req) => {
      const { pathname } = new URL(req.url);
      if (pathname.startsWith('/films/')) return spoken(pathname);
      return Effect.runPromise(Effect.sync(() => builtFile(files, pathname)));
    };
  });

/**
 * The review on `hostname`:`port`: every request goes to `review`, the
 * framework's handler, which admits it (only the hosts it is told) before its
 * routes answer /review/* and /lab/* and the app's page (`reviewPage`) the
 * rest. No route here answers on its own, so no path skips the Host check.
 * No scene editor, no studio.
 */
export const serveReview = (port: number, hostname: string, review: Handler) =>
  Bun.serve({
    hostname,
    port,
    development: false,
    // A film's first mix renders the whole film before it answers: as long as Bun allows.
    idleTimeout: REVIEW_IDLE_SECONDS,
    fetch: (req, server) => review(req, server),
  });

if (import.meta.main) {
  const server = serve(Number(Bun.env['PORT'] ?? 4400), true);
  console.log(`[animations] serving url=${server.url}`);
}
