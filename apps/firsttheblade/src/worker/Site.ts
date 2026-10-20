/**
 * The site on Cloudflare: one Worker that serves `dist/` from its static
 * assets, with every request passing through the policy in `./respond.ts`
 * first (`runWorkerFirst`), so its headers and its 404 hold for every file.
 *
 * Where it is served from follows the stage and `SERVED_FROM`
 * (`../site.ts`): `prod` takes the Worker name `firsttheblade` (so its
 * `workers.dev` host is `firsttheblade.<subdomain>.workers.dev`), and with
 * `SERVED_FROM = 'custom-domain'` it takes the apex domain, redirects `www`
 * and each of `REDIRECTED_DOMAINS` (with its `www`) to it, and turns its
 * `workers.dev` host off. Any other stage is a throwaway copy on a
 * generated `workers.dev` name and never takes the site's hostnames; it
 * shares the sending domain with prod (`./domain.ts`).
 *
 * The email list's routes run in the same Worker, over D1, Email Sending, a
 * Queue and a Rate Limit (`./mail.ts`). Its two secrets, `MAIL_TOKEN_KEY` (the
 * key its links are signed with) and `MAIL_ADMIN_TOKEN` (what `bun run
 * mail:send` must show), are read from the deployer's environment and bound
 * as Worker secrets; they are never in the repository. The Worker is also the
 * queue's consumer: each batch of a film's send is delivered here
 * (`../mail/deliver.ts`). Its cron trigger runs the daily purge of sign-ups
 * never confirmed (`../mail/purge.ts`).
 */
import type { RuntimeContext } from 'alchemy';
import { Stage } from 'alchemy/Stage';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Config, Effect, Layer, Option, Schema, Stream } from 'effect';
import { HttpServerRequest } from 'effect/http';

import { deliver } from '../mail/deliver.ts';
import { warnMail } from '../mail/log.ts';
import { purge, PURGE_CRON } from '../mail/purge.ts';
import { Delivery } from '../mail/queue.ts';
import type { MailServices } from '../mail/routes.ts';

import { DOMAIN, REDIRECTED_DOMAINS, SERVED_FROM, type ServedFrom, WORKER_NAME } from '../site.ts';
import { Assets } from './assets.ts';
import {
  DELIVERY,
  layerCloudflare,
  MailBindings,
  MailDatabase,
  MailQueue,
  MailSender,
  SignupLimit,
} from './mail.ts';
import { respond } from './respond.ts';

const readDelivery = Schema.decodeUnknownOption(Delivery);

/** The Worker's answer to a request: the policy, over the site's services. */
const serve = (services: Layer.Layer<MailServices, never, RuntimeContext>) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    return yield* respond(request);
  }).pipe(Effect.provide(services));

const ASSETS = {
  directory: 'dist',
  runWorkerFirst: true,
  htmlHandling: 'auto-trailing-slash',
  notFoundHandling: 'none',
} as const;

/** What `prod` claims, by where the site is served from. */
const PRODUCTION: Record<ServedFrom, Cloudflare.WorkerProps> = {
  'workers.dev': { name: WORKER_NAME, workersDev: true },
  'custom-domain': {
    name: WORKER_NAME,
    workersDev: false,
    domain: {
      name: DOMAIN,
      redirects: [`www.${DOMAIN}`, ...REDIRECTED_DOMAINS.flatMap((name) => [name, `www.${name}`])],
    },
  },
};

/**
 * The props, by stage. They are read at deploy time, where the stage is
 * known; the running Worker reads them too, without one, and needs only
 * the base.
 */
const props = Effect.gen(function* () {
  const stage = yield* Effect.serviceOption(Stage);
  const base = { main: import.meta.url, assets: ASSETS };
  if (!Option.contains(stage, 'prod')) return base;
  return { ...base, ...PRODUCTION[SERVED_FROM] };
});

export default class Site extends Cloudflare.Worker<Site>()(
  'Site',
  props,
  Effect.gen(function* () {
    const env = yield* Cloudflare.WorkerEnvironment;
    // The binding is read per request: the environment fills in when the
    // Worker runs, not when this module is bundled.
    const assets = Assets.of({
      serve: (request) =>
        Cloudflare.fromCloudflareFetcher(env['ASSETS']).fetch(request).pipe(Effect.orDie),
    });
    const queue = yield* MailQueue;
    const mail = layerCloudflare({
      db: yield* Cloudflare.D1.QueryDatabase(MailDatabase),
      email: yield* Cloudflare.Email.Send(MailSender),
      queue: yield* Cloudflare.Queues.WriteQueue(queue),
      limit: yield* SignupLimit,
      exec: yield* Cloudflare.WorkerExecutionContext,
      tokenKey: yield* Config.Redacted('MAIL_TOKEN_KEY'),
      adminToken: yield* Config.Redacted('MAIL_ADMIN_TOKEN'),
    });

    // A batch fails only when a letter could not be sent now; the queue
    // then tries the whole batch again, and what was sent is passed over.
    yield* Cloudflare.Queues.consumeQueueMessages(queue, DELIVERY, (messages) =>
      Effect.gen(function* () {
        const deliveries = [];
        for (const message of yield* Stream.runCollect(messages)) {
          const delivery = readDelivery(message.body);
          if (Option.isSome(delivery)) deliveries.push(delivery.value);
          else yield* warnMail('film.unreadable', { message: message.id });
        }
        yield* deliver(deliveries);
      }).pipe(Effect.provide(mail)),
    );

    yield* Cloudflare.Workers.cron(PURGE_CRON, () => purge().pipe(Effect.provide(mail)));

    return {
      fetch: serve(Layer.merge(Layer.succeed(Assets, assets), mail)),
    };
  }).pipe(Effect.provide(MailBindings)),
) {}
