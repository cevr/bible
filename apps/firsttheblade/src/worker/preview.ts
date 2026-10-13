/**
 * `bun run preview`: the built site on a laptop, through the same policy
 * the Worker runs (`./respond.ts`), its files read from `dist/` the way the
 * asset layer serves them. Build first (`bun run build`).
 */
import { BunHttpServer, BunRuntime, BunServices } from '@effect/platform-bun';
import { Config, Effect, Layer } from 'effect';
import { HttpServer, HttpServerRequest } from 'effect/http';

import { layerDirectory } from './assets.ts';
import { respond } from './respond.ts';

const app = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  return yield* respond(request);
});

const ServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const port = yield* Config.Port('PORT').pipe(Config.withDefault(8470));
    return BunHttpServer.layer({ port });
  }),
);

HttpServer.serve(app).pipe(
  HttpServer.withLogAddress,
  Layer.provide(layerDirectory('dist')),
  Layer.provide(ServerLive),
  Layer.provide(BunServices.layer),
  Layer.launch,
  BunRuntime.runMain,
);
