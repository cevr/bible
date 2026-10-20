/**
 * The email list on Cloudflare: its resources, and its services over the
 * Worker's bindings (`./Site.ts`).
 *
 * - `MailDatabase`: D1, the list. Alchemy applies `migrations/` on deploy.
 * - `MailSender`: the Email Sending binding, allowed to send only as `FROM`
 *   (`../mail/mailer.ts`).
 * - `MailQueue`: the queue a film's send is put on, delivered one batch at a
 *   time (`DELIVERY`).
 * - `SignupLimit`: the sign-up limit (`SIGNUPS`), a Rate Limiting binding.
 *
 * The bindings' clients answer only in the running Worker (`RuntimeContext`),
 * as does the request's `waitUntil`, which runs a sign-up's work after its
 * answer (`../mail/background.ts`).
 * `layerCloudflare` is built in it, keeps that context, and gives services
 * that need nothing more.
 */
import { RuntimeContext } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect, Layer, Option, type Redacted, Schema } from 'effect';

import { Background } from '../mail/background.ts';
import { layerSite } from '../mail/films.ts';
import { layer as listLayer } from '../mail/list.ts';
import { logMail } from '../mail/log.ts';
import { failureOf, FROM, Mailer } from '../mail/mailer.ts';
import { FilmQueue, QueueError } from '../mail/queue.ts';
import { AdminToken } from '../mail/routes.ts';
import { layerD1 } from '../mail/sql-d1.ts';
import { layerWebCrypto } from './crypto.ts';
import { SIGNUPS, Throttle } from '../mail/throttle.ts';
import { layer as tokensLayer } from '../mail/tokens.ts';

export const MailDatabase = Cloudflare.D1.Database('Mail', { migrations: './migrations' });

export const MailSender = Cloudflare.Email.SendEmail('MAIL', {
  allowedSenderAddresses: [FROM.email],
});

export const MailQueue = Cloudflare.Queues.Queue('FilmQueue');

export const SignupLimit = Cloudflare.RateLimit('SIGNUP_LIMIT', {
  namespaceId: 1001,
  simple: SIGNUPS,
});

/**
 * How the queue hands a film's send to the Worker: ten deliveries a batch,
 * one batch at a time, so no two deliveries run at once and the sends stay
 * under Email Sending's rate. A failed batch is tried again a minute later,
 * five times; after that, `bun run mail:send` again resumes the send.
 */
export const DELIVERY = {
  batchSize: 10,
  maxConcurrency: 1,
  maxRetries: 5,
  retryDelay: '1 minute',
  maxWaitTime: '5 seconds',
} as const;

export interface MailClients {
  readonly db: Cloudflare.D1.QueryDatabaseClient;
  readonly email: Cloudflare.Email.SendClient;
  readonly queue: Cloudflare.Queues.WriteQueueClient;
  readonly limit: Cloudflare.RateLimitClient;
  readonly exec: Cloudflare.WorkerExecutionContext['Service'];
  readonly tokenKey: Redacted.Redacted<string>;
  readonly adminToken: Redacted.Redacted<string>;
}

const Coded = Schema.Struct({ code: Schema.String });

/** The code an Email Sending error carries (`E_…`), or `E_UNKNOWN`. */
const codeOf = (cause: unknown) =>
  Option.match(Schema.decodeUnknownOption(Coded)(cause), {
    onNone: () => 'E_UNKNOWN',
    onSome: ({ code }) => code,
  });

/** The list's services over the Worker's bindings. */
export const layerCloudflare = (clients: MailClients) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const runtime = yield* RuntimeContext;
      const here = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.provideService(effect, RuntimeContext, runtime);
      const db = yield* here(clients.db.raw);

      const mailer = Mailer.of({
        send: (letter) =>
          here(
            clients.email.send({
              from: FROM,
              to: letter.to,
              subject: letter.subject,
              text: letter.text,
              html: letter.html,
              headers: { ...letter.headers },
            }),
          ).pipe(
            Effect.mapError((error) => failureOf(codeOf(error.cause))),
            Effect.asVoid,
          ),
      });

      const queue = FilmQueue.of({
        put: (deliveries) =>
          here(clients.queue.sendBatch(deliveries.map((body) => ({ body })))).pipe(
            Effect.mapError(() => QueueError.make({ reason: 'sendBatch' })),
          ),
      });

      // A limit that cannot be read lets the sign-up through: the honeypot
      // and the hour between confirm letters still hold.
      const throttle = Throttle.of({
        allow: (key) =>
          here(clients.limit.limit({ key })).pipe(
            Effect.map((result) => result.success),
            Effect.catch(() => logMail('throttle.unread').pipe(Effect.as(true))),
          ),
      });

      const background = Background.of({ run: (work) => here(clients.exec.waitUntil(work)) });

      return Layer.mergeAll(
        listLayer.pipe(Layer.provide(layerD1(db))),
        tokensLayer(clients.tokenKey),
        Layer.succeed(Mailer, mailer),
        Layer.succeed(FilmQueue, queue),
        Layer.succeed(Throttle, throttle),
        Layer.succeed(Background, background),
        Layer.succeed(AdminToken, clients.adminToken),
        layerWebCrypto,
        layerSite,
      );
    }),
  );

/** The runtime layers the list's bindings resolve through. */
export const MailBindings = Layer.mergeAll(
  Cloudflare.D1.QueryDatabaseBinding,
  Cloudflare.Email.SendBinding,
  Cloudflare.Queues.WriteQueueBinding,
  Cloudflare.Queues.EventSourceLive,
  Cloudflare.Workers.RateLimitBinding,
);
