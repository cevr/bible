// A case's hold on a pooled view (`browsers.ts`), apart from Chrome so its
// own test drives it over a fake view: taken from the pool, sized and given
// its pointer in one uninterruptible step, so an interrupted case still has
// its release run on whatever that step set; and given back only once it is
// as the pool lends it (the mouse's pointer, the idle page, no history),
// discarded when any of that fails, and never quietly.

import { Effect, Option, type Scope } from 'effect';
import type { View } from './tab.ts';

/** What a lease holds of a pooled view: the view, as the protocol drives it. */
export interface Leased {
  readonly lent: View;
}

/**
 * A pool's take over its `idle` views: the last one given back, or one
 * `make` opens when none waits. Nothing leaves `idle` until the take runs,
 * inside the lease's protected acquisition: a case interrupted before then
 * leaves every view in the pool.
 */
export const fromIdle = <S>(idle: Array<S>, make: Effect.Effect<S>): Effect.Effect<S> =>
  Effect.suspend(() =>
    Option.match(Option.fromUndefinedOr(idle.pop()), {
      onNone: () => make,
      onSome: Effect.succeed,
    }),
  );

/** How the pool keeps its views: one to lend, and where a view goes back, or goes when it cannot. */
export interface Pool<S extends Leased> {
  /** Run inside the lease's protected acquisition, never before: a view leaves the pool only there. */
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

/**
 * A phone's pointer on `view`, on or off: touch emulation, what makes
 * `(pointer: coarse)` match; and scrollbars that take no room, as a phone's
 * overlay ones, so a page that grows past the window keeps its width.
 */
const touch = (view: View, enabled: boolean) =>
  Effect.andThen(
    Effect.tryPromise(() =>
      view.cdp('Emulation.setTouchEmulationEnabled', { enabled, maxTouchPoints: 5 }),
    ),
    Effect.tryPromise(() => view.cdp('Emulation.setScrollbarsHidden', { hidden: enabled })),
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
