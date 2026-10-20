/**
 * `bun run mail:send <series>/<no>`: sends a film to the email list, once it
 * is in `src/content.ts` and the site that lists it is deployed. It asks the
 * Worker's send route (`src/mail/routes.ts`), which puts one delivery for
 * each confirmed subscriber on the queue; the Worker sends them a batch at a
 * time, and a subscriber already sent the film is passed over, so running it
 * again finishes a send that stopped and sends no one the film twice.
 *
 * `--dry-run` only counts: who is on the list, who was sent the film, who is
 * still waiting, and how many sends stopped before their outcome was kept
 * (unsure: their letter may have gone, so they are not sent again).
 * `--origin` names the site to ask (a throwaway stage's `workers.dev`
 * address); the film's links lead back to it. The admin secret
 * is `MAIL_ADMIN_TOKEN`, read from the environment (Bun loads `.env` here),
 * the same value the Worker was deployed with.
 */
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Config, Console, Effect, Layer, Schema } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';

import { SendAnswer, SendRequest } from '../src/mail/admin.ts';
import { MAIL_ROUTES } from '../src/mail/paths.ts';
import { ORIGIN } from '../src/site.ts';

/** The Worker refused the send; its words and status are the message. */
class SendFailed extends Schema.TaggedError<SendFailed>()('SendFailed', {
  message: Schema.String,
}) {}

export const send = Effect.fn('MailSend.send')(function* (input: {
  readonly film: string;
  readonly dryRun: boolean;
  readonly origin: string;
}) {
  const token = yield* Config.Redacted('MAIL_ADMIN_TOKEN');
  const client = yield* HttpClient.HttpClient;
  const request = yield* HttpClientRequest.post(new URL(MAIL_ROUTES.send, input.origin)).pipe(
    HttpClientRequest.bearerToken(token),
    HttpClientRequest.schemaBodyJson(SendRequest)({ film: input.film, dryRun: input.dryRun }),
  );
  const response = yield* client.execute(request);
  const answer = yield* response.json.pipe(Effect.flatMap(Schema.decodeUnknownEffect(SendAnswer)));
  if ('error' in answer) {
    return yield* SendFailed.make({ message: `${response.status} ${answer.error}` });
  }
  const counts = `${answer.confirmed} confirmed, ${answer.sent} sent, ${answer.refused} refused, ${answer.waiting} waiting, ${answer.unsure} unsure`;
  if (input.dryRun)
    return yield* Console.log(`${answer.film}: ${counts}. Dry run: nothing queued.`);
  yield* Console.log(`${answer.film}: ${counts}. Queued ${answer.queued} to send now.`);
});

const command = Command.make(
  'mail-send',
  {
    film: Argument.String('film').pipe(
      Argument.withDescription('The film, as <series>/<no>: path/01'),
    ),
    dryRun: Flag.Boolean('dry-run').pipe(
      Flag.withDefault(false),
      Flag.withDescription('Count only; send nothing'),
    ),
    origin: Flag.String('origin').pipe(
      Flag.withDefault(ORIGIN),
      Flag.withDescription('The deployed site to ask, and the one its links lead to'),
    ),
  },
  send,
).pipe(Command.withDescription('Send a film to the email list'));

const platform = Layer.mergeAll(FetchHttpClient.layer, BunServices.layer);

if (import.meta.main) {
  Command.run(command, { version: '1.0.0' }).pipe(Effect.provide(platform), BunRuntime.runMain);
}
