/**
 * A film's send, as the queue carries it: one delivery for each subscriber
 * (`FilmQueue`, a Cloudflare Queue, `../worker/mail.ts`). The admin route
 * puts them on (`./routes.ts`); the queue hands them to `./deliver.ts` in
 * batches, one batch at a time, and tries a failed batch again later.
 */
import { Context, Effect, Layer, Ref, Schema } from 'effect';

export const Delivery = Schema.Struct({
  /** `<series id>/<no>` (`./films.ts`). */
  film: Schema.String,
  subscriber: Schema.Int,
  /** The site the send was asked at, so its links lead back there. */
  origin: Schema.String,
});
export type Delivery = typeof Delivery.Type;

/** The most deliveries one call puts on the queue (Cloudflare's batch limit). */
export const BATCH = 100;

export class QueueError extends Schema.TaggedError<QueueError>()('QueueError', {
  reason: Schema.String,
}) {}

export interface FilmQueueService {
  /** At most `BATCH` deliveries. */
  readonly put: (deliveries: ReadonlyArray<Delivery>) => Effect.Effect<void, QueueError>;
}

export class FilmQueue extends Context.Service<FilmQueue, FilmQueueService>()(
  'firsttheblade/FilmQueue',
) {}

/** The deliveries a test's queue was given. */
export class Queued extends Context.Service<
  Queued,
  { readonly deliveries: Effect.Effect<ReadonlyArray<Delivery>> }
>()('firsttheblade/Queued') {}

/** A queue that keeps what it is given, for the tests. */
export const layerMemory = Layer.effectContext(
  Effect.gen(function* () {
    const kept = yield* Ref.make<ReadonlyArray<Delivery>>([]);
    const put = (deliveries: ReadonlyArray<Delivery>) =>
      Ref.update(kept, (all) => [...all, ...deliveries]);
    return Context.make(FilmQueue, FilmQueue.of({ put })).pipe(
      Context.add(Queued, Queued.of({ deliveries: Ref.get(kept) })),
    );
  }),
);
