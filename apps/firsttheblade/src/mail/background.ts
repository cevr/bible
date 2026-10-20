/**
 * Work a route starts and does not wait for: the answer goes first, and the
 * work runs after it. A sign-up's answer must take the same time for every
 * address, so the work that depends on the address (the store, the confirm
 * letter) runs here (`./routes.ts`).
 *
 * - On Cloudflare the work is registered with the request's `waitUntil`
 *   (`../worker/mail.ts`), which keeps the Worker alive until it settles.
 * - `layerInline` runs it in place, before the answer: the preview's, where
 *   no one times an answer.
 * - `layerHeld` keeps each work until `Held.settle` runs it: the tests', so
 *   a test can look at an answer before its work has run.
 */
import { Context, Effect, Layer, Ref } from 'effect';

export interface BackgroundService {
  /** Starts `work` after the answer. The work's own failures are its to log. */
  readonly run: <R>(work: Effect.Effect<void, never, R>) => Effect.Effect<void, never, R>;
}

export class Background extends Context.Service<Background, BackgroundService>()(
  'firsttheblade/Background',
) {}

export const layerInline = Layer.succeed(Background, Background.of({ run: (work) => work }));

/** The work `layerHeld` keeps, and what runs it. */
export class Held extends Context.Service<
  Held,
  {
    /** Runs every work kept, in the order it was started. */
    readonly settle: Effect.Effect<void>;
  }
>()('firsttheblade/Held') {}

export const layerHeld = Layer.effectContext(
  Effect.gen(function* () {
    const kept = yield* Ref.make<ReadonlyArray<Effect.Effect<void>>>([]);
    const run = <R>(work: Effect.Effect<void, never, R>) =>
      Effect.gen(function* () {
        const context = yield* Effect.context<R>();
        const ready = Effect.provideContext(work, context);
        yield* Ref.update(kept, (all) => [...all, ready]);
      });
    const settle = Effect.gen(function* () {
      for (const work of yield* Ref.getAndSet(kept, [])) yield* work;
    });
    return Context.make(Background, Background.of({ run })).pipe(
      Context.add(Held, Held.of({ settle })),
    );
  }),
);
