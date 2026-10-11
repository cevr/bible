/**
 * Requests that start together go out together.
 *
 * Every pane runs its own search, and the panes of one workspace usually start
 * in the same moment: a link with three panes, or Back to a workspace whose
 * panes all changed. Sent one by one, each is its own round trip and its own
 * context read on the server. Collected and sent as one batch, the server
 * answers them together and reads the surrounding paragraphs once per radius
 * (`runSearchBatch` in `../server/search.ts`).
 *
 * A batch goes out once a window passes with no new input: each input that
 * joins moves the send to a window after it. Inputs that join in one run of
 * the page go out together however long that run takes, and an input that
 * replaces one of its own (a reader still changing a search) leaves the
 * batch and moves the send, so only its last goes out.
 *
 * A batch is shared, so its lifetime is its callers'. A caller that is
 * interrupted (a superseded query, a closed pane) leaves the batch, and takes
 * its input out of it if the batch has not gone out yet; when the last caller
 * leaves, the batch itself is interrupted, which aborts its HTTP request. A
 * batch with a caller still waiting runs to the end.
 *
 * Effect's own `RequestResolver` batches the same way, but once a batch has
 * started it no longer hears its callers leave, so a closed pane's request
 * would run to the end. That abort is the reason this module exists.
 */

import type { Fiber } from 'effect';
import { Clock, Deferred, Duration, Effect, Exit, Option } from 'effect';

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
  /** Whether its inputs have gone out; until then a caller that leaves takes its slot. */
  sent: boolean;
  /** When it goes out, on the clock its fiber runs on: a window after its latest input. */
  due: number;
  fiber: Option.Option<Fiber.Fiber<void>>;
}

export const makeBatcher = <I, O, E>(options: {
  /** How long a batch waits after its latest input before it goes out. */
  readonly window: Duration.Input;
  /** The most inputs one batch carries; a full batch closes early. */
  readonly maxSize: number;
  /** Answer a batch, one exit per input, in input order. */
  readonly run: (inputs: ReadonlyArray<I>) => Effect.Effect<ReadonlyArray<Exit.Exit<O, E>>, E>;
}): Batcher<I, O, E> => {
  let open = Option.none<Batch<I, O, E>>();
  const window = Duration.toMillis(options.window);

  /** Sleep until the batch is due; an input that joined meanwhile moved it on. */
  const quiet = (batch: Batch<I, O, E>): Effect.Effect<void> =>
    Effect.flatMap(Clock.currentTimeMillis, (at) => {
      if (at >= batch.due) return Effect.void;
      return Effect.andThen(Effect.sleep(batch.due - at), quiet(batch));
    });

  const close = (batch: Batch<I, O, E>): void => {
    if (Option.exists(open, (current) => current === batch)) open = Option.none();
  };

  const send = (batch: Batch<I, O, E>) =>
    Effect.gen(function* () {
      close(batch);
      batch.sent = true;
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

  /**
   * Open a batch at `at`. Its fiber is the batch's, not the caller's: detached,
   * it outlives the caller that opened it, and it runs on that caller's clock.
   */
  const start = (at: number) =>
    Effect.gen(function* () {
      const batch: Batch<I, O, E> = {
        slots: [],
        waiting: 0,
        sent: false,
        due: at + window,
        fiber: Option.none(),
      };
      open = Option.some(batch);
      batch.fiber = Option.some(
        yield* Effect.forkDetach(Effect.andThen(quiet(batch), send(batch))),
      );
      return batch;
    });

  const leave = (batch: Batch<I, O, E>, slot: Slot<I, O, E>): void => {
    if (!batch.sent) batch.slots.splice(batch.slots.indexOf(slot), 1);
    batch.waiting -= 1;
    if (batch.waiting > 0) return;
    close(batch);
    if (Option.isSome(batch.fiber)) batch.fiber.value.interruptUnsafe();
  };

  return {
    // Joining is synchronous (no wait before it), so the inputs of one run of the
    // page join one batch; and whole, so a caller is never in a batch it cannot leave.
    submit: (input) =>
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const at = yield* Clock.currentTimeMillis;
          const batch = yield* Option.match(open, {
            onNone: () => start(at),
            onSome: Effect.succeed,
          });
          const slot: Slot<I, O, E> = { input, deferred: Deferred.makeUnsafe<O, E>() };
          batch.slots.push(slot);
          batch.waiting += 1;
          batch.due = at + window;
          if (batch.slots.length >= options.maxSize) close(batch);
          return yield* restore(Deferred.await(slot.deferred)).pipe(
            Effect.onInterrupt(() => Effect.sync(() => leave(batch, slot))),
          );
        }),
      ),
  };
};
