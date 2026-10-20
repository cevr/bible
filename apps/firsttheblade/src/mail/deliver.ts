/**
 * Delivering a batch of a film's send (`./queue.ts`): each subscriber still
 * confirmed and still waiting for the film is sent its letter, with a leave
 * link of its own, and the send is recorded. A subscriber already sent the
 * film, or gone from the list since the send was asked, is passed over, so a
 * batch tried again, or a film asked twice, reaches no one twice. A letter the
 * sender refuses for good is recorded as refused; one it cannot take now
 * fails the batch, which the queue tries again later from where it stopped.
 */
import { Clock, Effect, Layer, Option } from 'effect';

import { Films } from './films.ts';
import { filmLetter } from './letters.ts';
import { List } from './list.ts';
import { logMail, warnMail } from './log.ts';
import { Mailer } from './mailer.ts';
import { type Delivery, FilmQueue, QueueError } from './queue.ts';
import { Tokens } from './tokens.ts';

export const deliver = Effect.fn('Mail.deliver')(function* (deliveries: ReadonlyArray<Delivery>) {
  const list = yield* List;
  const mailer = yield* Mailer;
  const tokens = yield* Tokens;
  const films = yield* Films;
  const tally = { sent: 0, refused: 0, passed: 0 };
  for (const delivery of deliveries) {
    const film = films.find(delivery.film);
    if (Option.isNone(film)) {
      tally.passed += 1;
      yield* warnMail('film.unknown', { film: delivery.film });
      continue;
    }
    const to = yield* list.recipient(film.value.ref, delivery.subscriber);
    if (Option.isNone(to)) {
      tally.passed += 1;
      continue;
    }
    const token = yield* tokens.sign({ _tag: 'Unsubscribe', subscriber: delivery.subscriber });
    const letter = filmLetter(to.value, delivery.origin, film.value, token);
    const outcome = yield* mailer.send(letter).pipe(
      Effect.as('sent' as const),
      Effect.catchTag('MailRefused', (refusal) =>
        warnMail('film.refused', {
          film: film.value.ref,
          subscriber: delivery.subscriber,
          code: refusal.code,
        }).pipe(Effect.as('refused' as const)),
      ),
      Effect.tapError((failure) =>
        warnMail('film.retry', {
          film: film.value.ref,
          subscriber: delivery.subscriber,
          code: failure.code,
        }),
      ),
    );
    yield* list.record(
      film.value.ref,
      delivery.subscriber,
      outcome,
      yield* Clock.currentTimeMillis,
    );
    tally[outcome] += 1;
  }
  yield* logMail('film.delivered', { batch: deliveries.length, ...tally });
});

/**
 * A queue that delivers what it is given at once, in the same request, for
 * `bun run preview`, where there is no Cloudflare Queue.
 */
export const layerInlineQueue = Layer.effect(
  FilmQueue,
  Effect.gen(function* () {
    const services = yield* Effect.context<List | Mailer | Tokens | Films>();
    return FilmQueue.of({
      put: (deliveries) =>
        deliver(deliveries).pipe(
          Effect.provideContext(services),
          Effect.mapError((failure) => QueueError.make({ reason: failure._tag })),
        ),
    });
  }),
);
