// `film read` over the films folder its first argument names: the fresh
// process a test's `FreshFilm` runs (`['bun', <this file>, <films>]`), so a
// test reads a film the way the lab does, in a process that imports the
// film's files as they stand.

import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect, Layer, Stdio } from 'effect';
import { Command } from 'effect/cli';
import { ContentStore } from '../content-store.ts';
import { FilmRepo } from '../film-repo.ts';
import { read } from '../read-cli.ts';

/** The film CLI with `read` alone: `film read …`. */
const film = Command.make('film').pipe(Command.withSubcommands([read]));

Stdio.Stdio.use(({ args }) =>
  Effect.flatMap(args, ([films = '', ...given]) =>
    Command.runWith(film, { version: '0.0.0' })(given).pipe(
      Effect.provide(FilmRepo.layer(films).pipe(Layer.provideMerge(ContentStore.layer))),
    ),
  ),
).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain({ disableErrorReporting: true }));
