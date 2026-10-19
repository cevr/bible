// The `film` CLI for this app's films: the framework's commands over
// `src/films`, with this app's player served for `render` and `check`, and
// the lab (its pages `review.html` and `play.html`, every film) for `lab`
// (`bun cli.ts --help`). A server starts with its command and stops when it
// ends, fails or is interrupted.

import { PreviewServer, runFilmCli } from '@bible/film/tools';
import { Config, Effect, Layer, Path } from 'effect';
import { checkoutRootsOf } from './checkouts.ts';
import { CRITIQUE_RULES, JUDGE_RULES } from './rules.ts';
import { FILMS, LAB_PAGES, LAB_SERVERS, serve } from './server.ts';

/** The app's sound library, shared by its films (`sounds/library.ts`). */
export const SOUNDS = `${import.meta.dir}/sounds`;

/** The app's footage library, shared by its talks (`footage/library.lock.json`). */
export const FOOTAGE = `${import.meta.dir}/footage`;

/** The house look every concept prompt opens with (`docs/ref/`): its block and its picture (its paper, line and light; its hands float, which the house no longer draws). */
const HOUSE_LOOK = {
  text: `${import.meta.dir}/docs/ref/house-look.txt`,
  image: `${import.meta.dir}/docs/ref/house-look.png`,
};

/** The app's planned series, their drafts under `<series>/scripts/` (`series/README.md`). */
const SERIES = `${import.meta.dir}/series`;

/**
 * Where the app's runs put what they make (`out`: renders, sheets, project
 * folders), the lab's notes (`lab`) and the productions' ledgers
 * (`productions`, committed), whatever directory a run starts in (FILMS_OUT,
 * FILMS_LAB and FILMS_PRODUCTIONS move them).
 */
export const FOLDERS = {
  out: `${import.meta.dir}/out`,
  lab: `${import.meta.dir}/lab`,
  productions: `${import.meta.dir}/productions`,
};

/**
 * The player on any free port (nobody opens it by hand), its narration from
 * `films` and its talks' footage from the library's copies under the
 * outputs (FILMS_OUT, else the app's), stopped with the command's scope.
 */
const player = (films: string) =>
  Layer.effect(
    PreviewServer,
    Effect.gen(function* () {
      const out = yield* Config.String('FILMS_OUT').pipe(Config.withDefault(FOLDERS.out));
      const server = yield* Effect.acquireRelease(
        Effect.sync(() => serve(0, films, { dir: FOOTAGE, out })),
        (running) => Effect.promise(() => running.stop(true)),
      );
      return PreviewServer.of({ url: server.url.href });
    }),
  );

/**
 * Where the lab listens: `LAB_PORT` (8229) on `LAB_HOST`, loopback by
 * default. The phone's address is a second listener of its own
 * (`FILM_LAB_PHONE_URL`, read by the lab).
 */
const labAt = Effect.gen(function* () {
  const port = yield* Config.Int('LAB_PORT').pipe(Config.withDefault(8229));
  const hostname = yield* Config.String('LAB_HOST').pipe(Config.withDefault('127.0.0.1'));
  return { port, hostname };
});

/**
 * The lab's render roots when `FILM_REVIEW_ROOTS` names none: the renders of
 * every checkout of this repository on this machine, labelled by the
 * checkout (`checkouts.ts`).
 */
const checkoutRoots = Effect.flatMap(Path.Path, (path) =>
  checkoutRootsOf(path.resolve(import.meta.dir, '..', '..')),
);

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
    footage: FOOTAGE,
    series: SERIES,
    folders: FOLDERS,
    previewServer: player(films),
    lab: {
      at: labAt,
      // The lab's pages, this app's entries: its review, its lab, its player and its
      // render page, and the server entries of those the server renders.
      pages: { pages: LAB_PAGES, servers: LAB_SERVERS },
      roots: checkoutRoots,
    },
    // This CLI, for the lab's fresh `check --static` after each write.
    self: ['bun', self],
    judge: { rules: JUDGE_RULES },
    critique: { rules: CRITIQUE_RULES },
    house: HOUSE_LOOK,
  });

if (import.meta.main) appCli(FILMS, SOUNDS, import.meta.path);
