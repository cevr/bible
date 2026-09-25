/* oxlint-disable effect/noGlobals -- the development entry's browser boundary: it asks its own dev server for the gateway with the page's fetch. */
/**
 * The development browser entry: the page, plus live Frame inspection when
 * the dev server offers a gateway.
 *
 * The dev server answers `GET /__inspect` with `{ url, token }` only when it
 * runs with `EGW_INSPECT=1` (see `server/inspect.ts`). Any other answer —
 * the SPA fallback's HTML, a missing token file, a network error — means no
 * gateway, and the page runs exactly as in production.
 *
 * Start a gateway from the effect-frame checkout, with this page's origin:
 *
 *   bun packages/inspect/src/bin.ts gateway --origin http://localhost:3101
 *
 * then read the live page with `effect-frame roots` / `effect-frame inspect`.
 */

import { attachGateway, defaultOpenTimeout, defaultRetry } from 'effect-frame/inspection';
import { Effect, Option, Schema } from 'effect';

import { boot } from './boot.js';

const GatewayConfig = Schema.Struct({ url: Schema.String, token: Schema.String });

const offered = Effect.tryPromise(() =>
  fetch('/__inspect').then((response) => response.text()),
).pipe(
  Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(GatewayConfig))),
  Effect.option,
);

const inspect = Effect.gen(function* () {
  const gateway = yield* offered;
  if (Option.isNone(gateway)) {
    return;
  }
  yield* attachGateway({
    ...gateway.value,
    retry: defaultRetry,
    openTimeout: defaultOpenTimeout,
  }).pipe(
    Effect.catchTag('InvalidAttachOptions', (error) =>
      Effect.logWarning(`[inspect] attach refused detail=${error.detail}`),
    ),
  );
});

boot(inspect);
