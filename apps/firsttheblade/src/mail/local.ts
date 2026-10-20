/**
 * The list off Cloudflare, over SQLite in memory with the migrations applied
 * (`./sql-sqlite.ts`) and a token key made fresh each run:
 *
 * - `layerTest`: what the tests run the routes against, with the films they
 *   name (`./films.ts`). Its mailer and its queue keep what they are given
 *   (`Mailbox`, `Queued`), a sign-up's work waits for `Held.settle`, and its
 *   admin token is `TEST_ADMIN_TOKEN`.
 * - `layerPreview`: `bun run preview` and the contrast check. Each letter is
 *   written to a file in `outbox` instead of being sent, a sign-up's work and
 *   a film's send run at once; the admin token is `MAIL_ADMIN_TOKEN` when it
 *   is set.
 *
 * Both need the platform's file system (`BunServices.layer`).
 */
import { BunCrypto } from '@effect/platform-bun';
import { Config, Crypto, Effect, Layer, Redacted } from 'effect';
import { Hex } from 'effect/encoding';

import { layerHeld, layerInline } from './background.ts';
import { layerInlineQueue } from './deliver.ts';
import { type Films, layerSite } from './films.ts';
import { layer as listLayer } from './list.ts';
import { layerMemory as mailerMemory, layerOutbox } from './mailer.ts';
import { layerMemory as queueMemory } from './queue.ts';
import { AdminToken } from './routes.ts';
import { layerSqlite } from './sql-sqlite.ts';
import { layerMemory as throttleMemory } from './throttle.ts';
import { layer as tokensLayer } from './tokens.ts';

export const TEST_ADMIN_TOKEN = 'test-admin-token';

/** A key of 32 random bytes, which no one but this run holds. */
const freshKey = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  return Redacted.make(Hex.encode(yield* crypto.randomBytes(32)));
}).pipe(Effect.orDie);

const store = listLayer.pipe(Layer.provide(layerSqlite));

const freshTokens = Layer.unwrap(Effect.map(freshKey, tokensLayer));

export const layerTest = <E, R>(films: Layer.Layer<Films, E, R>) =>
  Layer.mergeAll(
    films,
    store,
    freshTokens,
    mailerMemory,
    queueMemory,
    throttleMemory,
    layerHeld,
    Layer.succeed(AdminToken, Redacted.make(TEST_ADMIN_TOKEN)),
  ).pipe(Layer.provideMerge(BunCrypto.layer));

export const layerPreview = (outbox: string) => {
  const core = Layer.mergeAll(layerSite, store, freshTokens, layerOutbox(outbox));
  const admin = Layer.effect(
    AdminToken,
    Effect.gen(function* () {
      const fallback = yield* freshKey;
      return yield* Config.Redacted('MAIL_ADMIN_TOKEN').pipe(Config.withDefault(fallback));
    }).pipe(Effect.orDie),
  );
  return Layer.mergeAll(layerInlineQueue, throttleMemory, layerInline, admin).pipe(
    Layer.provideMerge(core),
    Layer.provideMerge(BunCrypto.layer),
  );
};
