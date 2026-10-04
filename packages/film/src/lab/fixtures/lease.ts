// A case's hold on a pooled view (`browsers.ts`), apart from Chrome so its
// own test drives it over a fake view: taken from the pool, sized and given
// its pointer in one uninterruptible step, so an interrupted case still has
// its release run on whatever that step set; and given back only once it is
// as the pool lends it (the mouse's pointer, the idle page, no history),
// discarded when any of that fails, and never quietly.

import { Effect, type Scope } from 'effect';
import type { View } from './tab.ts';

/** What a lease holds of a pooled view: the view, as the protocol drives it. */
export interface Leased {
  readonly lent: View;
}

/** How the pool keeps its views: one to lend, and where a view goes back, or goes when it cannot. */
export interface Pool<S extends Leased> {
  readonly take: Effect.Effect<S>;
  readonly giveBack: (slot: S) => void;
  readonly discard: (slot: S) => void;
  /** Make `slot` blank for the next case (the idle page, no history), after the lease's own resets. */
  readonly blank: (slot: S) => Effect.Effect<void, unknown>;
}

/** What a case asks of its view: its size, and a phone's pointer (touch emulation) or the mouse. */
export interface Ask {
  readonly width: number;
  readonly height: number;
  readonly coarse: boolean;
}

/** Touch emulation on `view`, on or off: what makes `(pointer: coarse)` match. */
const touch = (view: View, enabled: boolean) =>
  Effect.tryPromise(() =>
    view.cdp('Emulation.setTouchEmulationEnabled', { enabled, maxTouchPoints: 5 }),
  );

/**
 * A view of `pool` sized and pointed as `ask` says, until the scope closes.
 * The take, the size and the pointer are one uninterruptible acquisition:
 * an interrupt waits for it, then the release runs; a view it cannot size or
 * point is discarded and the case dies. The release puts the
 * mouse back, blanks the view and gives it back; if any step fails, the view
 * is discarded and the failure logged (`pool.view.discarded`).
 */
export const lease = <S extends Leased>(
  pool: Pool<S>,
  ask: Ask,
): Effect.Effect<S, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.gen(function* () {
      const slot = yield* pool.take;
      // A view that cannot be sized or pointed is no case's: discarded, and the case fails.
      yield* Effect.gen(function* () {
        yield* Effect.tryPromise(() => slot.lent.resize(ask.width, ask.height));
        if (ask.coarse) yield* touch(slot.lent, true);
      }).pipe(
        Effect.onError(() => Effect.sync(() => pool.discard(slot))),
        Effect.orDie,
      );
      return slot;
    }),
    (slot) =>
      Effect.gen(function* () {
        if (ask.coarse) yield* touch(slot.lent, false);
        yield* pool.blank(slot);
        yield* Effect.sync(() => pool.giveBack(slot));
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.andThen(
            Effect.logWarning('pool.view.discarded', cause),
            Effect.sync(() => pool.discard(slot)),
          ),
        ),
      ),
  );
