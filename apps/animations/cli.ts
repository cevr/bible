// The `film` CLI for this app's films: the framework's commands over
// `src/films`, with this app's player served for `render` and `check`, and
// the lab (its pages `review.html`, `lab.html` and `index.html`, every film) for `lab`
// (`bun cli.ts --help`). A server starts with its command and stops when it
// ends, fails or is interrupted.

import { type LabHandler, PreviewServer, type ReviewRoot, runFilmCli } from '@bible/film/tools';
import { Config, Effect, FileSystem, Layer, Path } from 'effect';
import { FILMS, serve, serveLab } from './server.ts';

/** The app's sound library, shared by its films (`sounds/library.ts`). */
export const SOUNDS = `${import.meta.dir}/sounds`;

/** The player on any free port (nobody opens it by hand), its narration from `films`, stopped with the command's scope. */
const player = (films: string) =>
  Layer.effect(
    PreviewServer,
    Effect.acquireRelease(
      Effect.sync(() => serve(0, films)),
      (server) => Effect.promise(() => server.stop(true)),
    ).pipe(Effect.map((server) => PreviewServer.of({ url: server.url.href }))),
  );

/**
 * Where the lab listens: `LAB_PORT` (8229) on `LAB_HOST`. The host defaults
 * to loopback; the box's unit binds every interface (`0.0.0.0`), with the
 * names it is reached by in `FILM_LAB_HOSTS`.
 */
const labAt = Effect.gen(function* () {
  const port = yield* Config.Int('LAB_PORT').pipe(Config.withDefault(8229));
  const host = yield* Config.String('LAB_HOST').pipe(Config.withDefault('127.0.0.1'));
  return { port, host };
});

/** The lab, every request answered by `handler`, stopped with the command's scope. */
const labServer = (handler: LabHandler) =>
  Layer.effect(
    PreviewServer,
    Effect.acquireRelease(
      Effect.map(labAt, ({ port, host }) => serveLab(port, host, handler)),
      (server) => Effect.promise(() => server.stop(true)),
    ).pipe(Effect.map((server) => PreviewServer.of({ url: server.url.href }))),
  );

/**
 * The lab's render roots when `FILM_REVIEW_ROOTS` names none: the renders of
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
 * the entry at `self`. The pages import this app's registry
 * (`src/films/index.ts`), so only the app's own films render or open in the
 * lab. Renders go under this app's `out/` and notes under its `lab/`,
 * whatever directory the run starts in (FILMS_OUT and FILMS_LAB move them).
 */
export const appCli = (films: string, sounds: string, self: string): void =>
  runFilmCli<Config.ConfigError>({
    films,
    sounds,
    folders: { out: `${import.meta.dir}/out`, lab: `${import.meta.dir}/lab` },
    previewServer: player(films),
    lab: {
      server: labServer,
      // The lab's pages, built from this app's source: the review at `/`, the lab at `/lab`,
      // the player (its look-book) at `/player`.
      pages: {
        pages: {
          '/': `${import.meta.dir}/review.html`,
          '/lab': `${import.meta.dir}/lab.html`,
          '/player': `${import.meta.dir}/index.html`,
        },
        sources: [`${import.meta.dir}/src`, `${import.meta.dir}/assets`],
      },
      roots: checkoutRoots,
    },
    // This CLI, for the lab's fresh `check --static` after each write.
    self: ['bun', self],
  });

if (import.meta.main) appCli(FILMS, SOUNDS, import.meta.path);
