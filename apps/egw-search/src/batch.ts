/**
 * Requests that start together go out together.
 *
 * Every pane runs its own search, and the panes of one workspace usually start
 * in the same moment: a link with three panes, or Back to a workspace whose
 * panes all changed. Sent one by one, each is its own round trip and its own
 * context read on the server. Collected for a short window and sent as one
 * batch, the server answers them together and reads the surrounding
 * paragraphs once per radius (`runSearchBatch` in `../server/search.ts`).
 *
 * A batch is shared, so its lifetime is its callers'. A caller that is
 * interrupted (a superseded query, a closed pane) leaves the batch; when the
 * last caller leaves, the batch itself is interrupted, which aborts its HTTP
 * request. A batch with a caller still waiting runs to the end.
 *
 * Effect's own `RequestResolver` batches the same way, but once a batch has
 * started it no longer hears its callers leave, so a closed pane's request
 * would run to the end. That abort is the reason this module exists.
 */

import type { Duration, Fiber } from 'effect';
import { Deferred, Effect, Exit, Option } from 'effect';

export interface Batcher<I, O, E> {
  /** Join the open batch, or open one, and wait for this input's slot. */
  readonly submit: (input: I) => Effect.Effect<O, E>;
}

interface Slot<I, O, E> {
  readonly input: I;
  readonly deferred: Deferred.Deferred<O, E>;
}

interface Batch<I, O, E> {
  readonly slots: Slot<I, O, E>[];
  /** Callers still waiting on this batch. */
  waiting: number;
  fiber: Option.Option<Fiber.Fiber<void>>;
}

export const makeBatcher = <I, O, E>(options: {
  /** How long a batch stays open for more inputs after its first. */
  readonly window: Duration.Input;
  /** The most inputs one batch carries; a full batch closes early. */
  readonly maxSize: number;
  /** Answer a batch, one exit per input, in input order. */
  readonly run: (inputs: ReadonlyArray<I>) => Effect.Effect<ReadonlyArray<Exit.Exit<O, E>>, E>;
}): Batcher<I, O, E> => {
  let open = Option.none<Batch<I, O, E>>();

  const close = (batch: Batch<I, O, E>): void => {
    if (Option.exists(open, (current) => current === batch)) open = Option.none();
  };

  const send = (batch: Batch<I, O, E>) =>
    Effect.gen(function* () {
      close(batch);
      const exit = yield* Effect.exit(options.run(batch.slots.map((slot) => slot.input)));
      batch.slots.forEach((slot, index) => {
        if (Exit.isFailure(exit)) {
          Deferred.doneUnsafe(slot.deferred, Exit.failCause(exit.cause));
          return;
        }
        const answer = Option.fromUndefinedOr(exit.value[index]);
        Deferred.doneUnsafe(
          slot.deferred,
          Option.getOrElse(answer, () =>
            Exit.die(`batch answered ${String(exit.value.length)} of its inputs`),
          ),
        );
      });
    });

  const start = (): Batch<I, O, E> => {
    const batch: Batch<I, O, E> = { slots: [], waiting: 0, fiber: Option.none() };
    open = Option.some(batch);
    batch.fiber = Option.some(
      Effect.runFork(Effect.andThen(Effect.sleep(options.window), send(batch))),
    );
    return batch;
  };

  const leave = (batch: Batch<I, O, E>): void => {
    batch.waiting -= 1;
    if (batch.waiting > 0) return;
    close(batch);
    if (Option.isSome(batch.fiber)) batch.fiber.value.interruptUnsafe();
  };

  return {
    submit: (input) =>
      Effect.suspend(() => {
        const batch = Option.getOrElse(open, start);
        const deferred = Deferred.makeUnsafe<O, E>();
        batch.slots.push({ input, deferred });
        batch.waiting += 1;
        if (batch.slots.length >= options.maxSize) close(batch);
        return Deferred.await(deferred).pipe(
          Effect.onInterrupt(() => Effect.sync(() => leave(batch))),
        );
      }),
  };
};
