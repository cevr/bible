// The `film` CLI for this app's films: the framework's commands, with this
// app's player served for `render` (`bun cli.ts --help`). The server starts
// with a render and stops when it ends, fails or is interrupted.

import { PreviewServer, runFilmCli } from '@bible/film/tools';
import { Effect, Layer } from 'effect';
import { serve } from './server.ts';

const Player = Layer.effect(
  PreviewServer,
  Effect.acquireRelease(
    Effect.sync(() => serve(0, false)),
    (server) => Effect.promise(() => server.stop(true)),
  ).pipe(Effect.map((server) => PreviewServer.of({ url: server.url.href }))),
);

runFilmCli(Player);
