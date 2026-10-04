// A lease on a fake view: an interrupt that lands while the phone's pointer
// is being set waits for it and puts the mouse back before the view is given
// back; a view whose reset fails is discarded, never given back; and one
// that cannot be pointed is discarded and the case dies.

import { describe, expect, it } from 'effect-bun-test';
import { Deferred, Effect, Exit, Fiber } from 'effect';
import { type Leased, type Pool, lease } from './lease.ts';
import type { View } from './tab.ts';

/** A fake view: the protocol calls it was sent, and whether it has touch on. */
interface Fake extends Leased {
  readonly calls: Array<string>;
  touch: boolean;
}

/**
 * A fake view whose touch calls wait on `gate` (opened at once when none),
 * telling `sent` when one is sent; `fails` names the touch states it refuses
 * to be set to.
 */
const fake = (
  gate: Deferred.Deferred<void>,
  sent: Deferred.Deferred<void>,
  fails: ReadonlyArray<boolean> = [],
): Fake => {
  const slot: Fake = {
    calls: [],
    touch: false,
    lent: {
      cdp: (method, params) => {
        if (method !== 'Emulation.setTouchEmulationEnabled') return Effect.runPromise(Effect.void);
        const enabled = params?.['enabled'] === true;
        slot.calls.push(`touch ${enabled}`);
        return Effect.runPromise(
          Effect.gen(function* () {
            yield* Deferred.done(sent, Exit.void);
            yield* Deferred.await(gate);
            if (fails.includes(enabled)) return yield* Effect.die(`touch ${enabled} refused`);
            slot.touch = enabled;
            return {};
          }),
        );
      },
      evaluate: () => Effect.runPromise(Effect.die('unused')),
      navigate: () => Effect.runPromise(Effect.void),
      reload: () => Effect.runPromise(Effect.void),
      resize: (width, height) =>
        Effect.runPromise(
          Effect.sync(() => {
            slot.calls.push(`resize ${width}×${height}`);
          }),
        ),
    } satisfies View,
  };
  return slot;
};

/** A pool of the one fake view, keeping where it went. */
const poolOf = (slot: Fake) => {
  const went: Array<string> = [];
  const pool: Pool<Fake> = {
    take: Effect.succeed(slot),
    blank: () => Effect.sync(() => went.push('blanked')),
    giveBack: () => {
      went.push('given back');
    },
    discard: () => {
      went.push('discarded');
    },
  };
  return { pool, went };
};

const PHONE = { width: 390, height: 844, coarse: true };

describe('a lease on a pooled view', () => {
  it.effect(
    'interrupted while the pointer is set, it puts the mouse back before giving it back',
    () =>
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        const sent = yield* Deferred.make<void>();
        const slot = fake(gate, sent);
        const { pool, went } = poolOf(slot);
        const fiber = yield* Effect.forkChild(
          Effect.scoped(Effect.andThen(lease(pool, PHONE), Effect.never)),
        );
        yield* Deferred.await(sent);
        // The interrupt lands while touch is being turned on, then the call answers.
        const interrupting = yield* Effect.forkChild(Fiber.interrupt(fiber));
        // The interrupter runs and sends its interrupt before the call answers.
        yield* Effect.yieldNow;
        yield* Effect.yieldNow;
        yield* Deferred.done(gate, Exit.void);
        yield* Fiber.join(interrupting);
        expect(slot.calls).toEqual(['resize 390×844', 'touch true', 'touch false']);
        expect(slot.touch).toBe(false);
        expect(went).toEqual(['blanked', 'given back']);
      }),
  );

  it.effect('a view whose pointer cannot be put back is discarded, not given back', () =>
    Effect.gen(function* () {
      const gate = yield* Deferred.make<void>();
      const sent = yield* Deferred.make<void>();
      yield* Deferred.done(gate, Exit.void);
      const slot = fake(gate, sent, [false]);
      const { pool, went } = poolOf(slot);
      yield* Effect.scoped(lease(pool, PHONE));
      expect(slot.calls).toEqual(['resize 390×844', 'touch true', 'touch false']);
      expect(went).toEqual(['discarded']);
    }),
  );

  it.effect('a view that cannot take the pointer is discarded, and the case dies', () =>
    Effect.gen(function* () {
      const gate = yield* Deferred.make<void>();
      const sent = yield* Deferred.make<void>();
      yield* Deferred.done(gate, Exit.void);
      const slot = fake(gate, sent, [true]);
      const { pool, went } = poolOf(slot);
      const exit = yield* Effect.exit(Effect.scoped(lease(pool, PHONE)));
      expect(Exit.hasDies(exit)).toBe(true);
      expect(went).toEqual(['discarded']);
    }),
  );

  it.effect("the mouse's lease never touches the pointer", () =>
    Effect.gen(function* () {
      const gate = yield* Deferred.make<void>();
      const sent = yield* Deferred.make<void>();
      const slot = fake(gate, sent);
      const { pool, went } = poolOf(slot);
      yield* Effect.scoped(lease(pool, { width: 1400, height: 900, coarse: false }));
      expect(slot.calls).toEqual(['resize 1400×900']);
      expect(went).toEqual(['blanked', 'given back']);
    }),
  );
});
