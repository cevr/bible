// The `film` CLI for this app's films: the framework's commands over
// `src/films`, with this app's player served for `render` and `check`, and in
// development mode with the lab's routes for `lab` (`bun cli.ts --help`). A
// server starts with its command and stops when it ends, fails or is
// interrupted.

import { type LabHandler, PreviewServer, runFilmCli } from '@bible/film/tools';
import { Config, Effect, Layer } from 'effect';
import { FILMS, serve } from './server.ts';

/** The player on `port`, stopped with the command's scope. */
const player = (
  port: Effect.Effect<number, Config.ConfigError>,
  development: boolean,
  lab?: LabHandler,
) =>
  Layer.effect(
    PreviewServer,
    Effect.acquireRelease(
      Effect.map(port, (p) => serve(p, development, lab)),
      (server) => Effect.promise(() => server.stop(true)),
    ).pipe(Effect.map((server) => PreviewServer.of({ url: server.url.href }))),
  );

/** The lab's port: `LAB_PORT`, else 4401 (beside `bun run dev` on 4400). */
const labPort = Effect.gen(function* () {
  return yield* Config.Int('LAB_PORT').pipe(Config.withDefault(4401));
});

runFilmCli({
  films: FILMS,
  // Any free port: nobody opens it by hand.
  previewServer: player(Effect.succeed(0), false),
  // A port to keep open in a tab across runs.
  labServer: (lab) => player(labPort, true, lab),
});
