/**
 * The site on Bun, for `bun run start`: the production build served on this
 * machine exactly as Railway serves it (`src/deploy/Server.ts` mounts the same
 * routes). Run `bun run build` first. For development use `bun run dev`, React
 * Router's own Vite server.
 */
import { BunHttpServer, BunRuntime } from '@effect/platform-bun';
import { Config, Layer } from 'effect';
import { HttpRouter } from 'effect/http';

import * as build from '#server-build';

import * as Site from './src/server/site.ts';

const ServerLive = HttpRouter.serve(Site.layer(build, `${import.meta.dir}/build/client`)).pipe(
  Layer.provide(
    BunHttpServer.layerConfig({ port: Config.Int('PORT').pipe(Config.withDefault(3000)) }),
  ),
);

BunRuntime.runMain(Layer.launch(ServerLive));
