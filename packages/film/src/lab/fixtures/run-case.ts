// A test body for a case that runs its effect by hand (`test.serial`, which
// effect-bun-test's runners do not offer), as those runners run theirs from
// effect-bun-test 0.5.0: on a fiber of its own, which the case's finished
// hook interrupts when bun ends the case, its timeout included, waiting for
// its finalizers (its tabs, its lab), so a case that timed out stops before
// the next one starts. The deadline is bun's own, in real time. A fiber
// already done is left as it is; once the hook has interrupted it, the
// case's promise settles quietly, since bun has reported the timeout.

import { onTestFinished } from 'bun:test';
import { Effect, Fiber } from 'effect';

/** Run `effect` as a case's body, interrupted when bun ends the case. */
export const runCase = <A, E>(effect: Effect.Effect<A, E>): Promise<void> => {
  const fiber = Effect.runFork(effect);
  let ended = false;
  onTestFinished(() => {
    ended = true;
    return Effect.runPromise(Fiber.interrupt(fiber));
  });
  return Effect.runPromise(
    Fiber.join(fiber).pipe(
      Effect.asVoid,
      Effect.catchCause((cause) => {
        if (ended) return Effect.void;
        return Effect.failCause(cause);
      }),
    ),
  );
};
