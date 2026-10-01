// The `film` CLI for this app's films: the framework's commands over
// `src/films`, with this app's player served for `render` and `check`, in
// development mode with the lab's routes for `lab`, and the review's page for
// `review` (`bun cli.ts --help`). A server starts with its command and stops
// when it ends, fails or is interrupted.

import {
  type LabHandler,
  PreviewServer,
  type ReviewPageFailed,
  type ReviewRoot,
  runFilmCli,
} from '@bible/film/tools';
import { Config, Effect, FileSystem, Layer, Path } from 'effect';
import { FILMS, reviewPage, serve, serveReview } from './server.ts';

/** The app's sound library, shared by its films (`sounds/library.ts`). */
export const SOUNDS = `${import.meta.dir}/sounds`;

/** The player on `port`, serving the narration under `films`, stopped with the command's scope. */
const player = (
  port: Effect.Effect<number, Config.ConfigError>,
  development: boolean,
  films: string,
  lab?: LabHandler,
) =>
  Layer.effect(
    PreviewServer,
    Effect.acquireRelease(
      Effect.map(port, (p) => serve(p, development, lab, films)),
      (server) => Effect.promise(() => server.stop(true)),
    ).pipe(Effect.map((server) => PreviewServer.of({ url: server.url.href }))),
  );

/** The lab's port: `LAB_PORT`, else 4401 (beside `bun run dev` on 4400). */
const labPort = Effect.gen(function* () {
  return yield* Config.Int('LAB_PORT').pipe(Config.withDefault(4401));
});

/**
 * Where the review listens: `REVIEW_PORT` (8229) on `REVIEW_HOST`. The host
 * defaults to loopback; the box's unit binds every interface (`0.0.0.0`),
 * with the names it is reached by in `FILM_REVIEW_HOSTS`.
 */
const reviewAt = Effect.gen(function* () {
  const port = yield* Config.Int('REVIEW_PORT').pipe(Config.withDefault(8229));
  const host = yield* Config.String('REVIEW_HOST').pipe(Config.withDefault('127.0.0.1'));
  return { port, host };
});

/** The review, every request answered by `handler`, stopped with the command's scope. */
const reviewServer = (handler: LabHandler) =>
  Layer.effect(
    PreviewServer,
    Effect.acquireRelease(
      Effect.map(reviewAt, ({ port, host }) => serveReview(port, host, handler)),
      (server) => Effect.promise(() => server.stop(true)),
    ).pipe(Effect.map((server) => PreviewServer.of({ url: server.url.href }))),
  );

/**
 * The review's roots when `FILM_REVIEW_ROOTS` names none: the renders of
 * every checkout of this repository beside this one (`bible-tools*`, a rift
 * or worktree each), labelled by the checkout.
 */
const checkoutRoots = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const repo = path.resolve(import.meta.dir, '..', '..');
  const siblings = path.dirname(repo);
  const prefix = path.basename(repo).split('-')[0] ?? 'bible';
  const names = yield* fs.readDirectory(siblings).pipe(Effect.orElseSucceed(() => []));
  const roots = names
    .filter((name) => name.startsWith(prefix))
    .toSorted()
    .map((name): ReviewRoot => ({
      label: name,
      path: path.join(siblings, name, 'apps', 'animations', 'out'),
    }));
  return yield* Effect.filter(roots, (root) =>
    fs.exists(root.path).pipe(Effect.orElseSucceed(() => false)),
  );
});

/**
 * The CLI over the films in `films` and the sound library in `sounds`, run by
 * the entry at `self`. The player page imports this app's registry
 * (`src/films/index.ts`), so only the app's own films render or open in the
 * lab; the tests' fixture entry (`test/fixtures/cli.ts`) drives the legs that
 * need no page. Renders go under this app's `out/` and notes under its
 * `lab/`, whatever directory the run starts in (FILMS_OUT and FILMS_LAB move
 * them).
 */
export const appCli = (films: string, sounds: string, self: string): void =>
  runFilmCli<Config.ConfigError | ReviewPageFailed>({
    films,
    sounds,
    folders: { out: `${import.meta.dir}/out`, lab: `${import.meta.dir}/lab` },
    // Any free port: nobody opens it by hand.
    previewServer: player(Effect.succeed(0), false, films),
    // A port to keep open in a tab across runs.
    labServer: (lab) => player(labPort, true, films, lab),
    review: { server: reviewServer, page: reviewPage(films), roots: checkoutRoots },
    // This CLI, for the lab's fresh `check --static` after each write.
    self: ['bun', self],
  });

if (import.meta.main) appCli(FILMS, SOUNDS, import.meta.path);
