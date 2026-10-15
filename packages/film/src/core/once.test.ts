import { describe, expect, it, yieldFibers } from 'effect-bun-test';
import { Deferred, Effect, Exit, Fiber, Scope } from 'effect';
import { onceScoped } from './once.ts';

/**
 * A run no interruption stops once begun, as a WebAssembly engine's start is
 * (a promise with no signal): it counts itself in `runs` when `opened`
 * resolves, whoever still waits for it, and answers its count.
 */
const uncancellable = (opened: Promise<void>, runs: { count: number }) =>
  Effect.promise(() =>
    opened.then(() => {
      runs.count += 1;
      return runs.count;
    }),
  );

/** A gate a test opens: the promise a run waits on, and its opening. */
const gate = () => {
  // oxlint-disable-next-line effect/noNewPromise -- the run under test is a promise with no signal, as an engine's start is
  const { promise, resolve } = Promise.withResolvers<void>();
  return { opened: promise, open: Effect.sync(() => resolve()) };
};

describe('onceScoped', () => {
  it.effect(
    'starts a run once, though the caller that started it is interrupted while it waits',
    () =>
      Effect.gen(function* () {
        const { opened, open } = gate();
        const runs = { count: 0 };
        const scope = yield* Scope.make();
        const run = yield* Scope.provide(onceScoped(uncancellable(opened, runs)), scope);
        const first = yield* Effect.forkChild(run);
        yield* yieldFibers;
        yield* Fiber.interrupt(first);
        const later = yield* Effect.forkChild(run);
        yield* open;
        expect(yield* Fiber.join(later)).toBe(1);
        expect(runs.count).toBe(1);
        yield* Scope.close(scope, Exit.void);
      }),
  );

  it.effect('runs once for callers that ask together, and answers each', () =>
    Effect.gen(function* () {
      const { opened, open } = gate();
      const runs = { count: 0 };
      const scope = yield* Scope.make();
      const run = yield* Scope.provide(onceScoped(uncancellable(opened, runs)), scope);
      const callers = yield* Effect.forkChild(Effect.all([run, run, run], { concurrency: 3 }));
      yield* yieldFibers;
      yield* open;
      expect(yield* Fiber.join(callers)).toEqual([1, 1, 1]);
      expect(yield* run).toBe(1);
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect('keeps a failure as the answer, as a run that ended', () =>
    Effect.gen(function* () {
      const runs = { count: 0 };
      const scope = yield* Scope.make();
      const run = yield* Scope.provide(
        onceScoped(
          Effect.andThen(
            Effect.sync(() => {
              runs.count += 1;
            }),
            Effect.fail('unreadable'),
          ),
        ),
        scope,
      );
      expect(yield* Effect.exit(run)).toEqual(Exit.fail('unreadable'));
      expect(yield* Effect.exit(run)).toEqual(Exit.fail('unreadable'));
      expect(runs.count).toBe(1);
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect('interrupts a run still going when the scope that made it closes', () =>
    Effect.gen(function* () {
      const gated = yield* Deferred.make<void>();
      const runs = { count: 0 };
      const scope = yield* Scope.make();
      const run = yield* Scope.provide(
        onceScoped(
          Effect.andThen(
            Deferred.await(gated),
            Effect.sync(() => {
              runs.count += 1;
            }),
          ),
        ),
        scope,
      );
      const caller = yield* Effect.forkChild(run);
      yield* yieldFibers;
      yield* Scope.close(scope, Exit.void);
      expect(Exit.hasInterrupts(yield* Fiber.await(caller))).toBe(true);
      yield* Deferred.done(gated, Exit.void);
      yield* yieldFibers;
      expect(runs.count).toBe(0);
    }),
  );
});
