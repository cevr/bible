import { EGWApiClient, EGWAuth } from '@bible/core/egw';
import { EGWCommentaryService } from '@bible/core/egw-commentary';
import * as EGWDbBun from '@bible/core/egw-db/bun';
import { WritingsService } from '@bible/core/writings/service';
import { BunServices } from '@effect/platform-bun';
import { Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';

const AuthLayer = EGWAuth.layerLiveFs().pipe(Layer.provide(FetchHttpClient.layer));

export const ApiClientLayer = EGWApiClient.Live.pipe(
  Layer.provide(AuthLayer),
  Layer.provide(FetchHttpClient.layer),
);

export const ServiceLayer = WritingsService.Live.pipe(
  Layer.provide(EGWDbBun.Default),
  Layer.provide(BunServices.layer),
);

export const CommentaryLayer = EGWCommentaryService.Default.pipe(
  Layer.provide(EGWDbBun.Default),
  Layer.provide(BunServices.layer),
);

export const FullLayer = Layer.mergeAll(
  ApiClientLayer,
  EGWDbBun.Default,
  WritingsService.Live.pipe(Layer.provide(EGWDbBun.Default)),
).pipe(Layer.provide(BunServices.layer));
