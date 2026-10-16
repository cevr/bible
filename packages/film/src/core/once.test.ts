import { describe, expect, it, yieldFibers } from 'effect-bun-test';
import { Deferred, Effect, Exit, Fiber, Option, Scheduler, Scope } from 'effect';
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

/**
 * A scheduler that makes `caller` yield once, at its first step after it has
 * queued a task (the fork of the run): the moment between the fork and the
 * record of it that an interruption must not split.
 */
const yieldAfterFork = (caller: { fiber: Option.Option<Fiber.Fiber<unknown, unknown>> }) => {
  const mixed = new Scheduler.MixedScheduler();
  const state = { armed: false, yielded: false };
  const isCaller = (fiber: Fiber.Fiber<unknown, unknown>) =>
    Option.exists(caller.fiber, (held) => held === fiber);
  const scheduler: Scheduler.Scheduler = {
    executionMode: mixed.executionMode,
    shouldYield: (fiber) => {
      if (!isCaller(fiber) || !state.armed || state.yielded) return mixed.shouldYield(fiber);
      state.yielded = true;
      return true;
    },
    makeDispatcher: () => {
      const dispatcher = mixed.makeDispatcher();
      return {
        scheduleTask: (task, priority) => {
          if (Option.isSome(caller.fiber)) state.armed = true;
          dispatcher.scheduleTask(task, priority);
        },
        flush: () => dispatcher.flush(),
      };
    },
  };
  return { scheduler, state };
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

  it.effect(
    'starts a run once, though its first caller is interrupted between the fork and the record of it',
    () =>
      Effect.suspend(() => {
        const caller = { fiber: Option.none<Fiber.Fiber<unknown, unknown>>() };
        const { scheduler, state } = yieldAfterFork(caller);
        const runs = { count: 0 };
        return Effect.scoped(
          Effect.gen(function* () {
            const finish = yield* Deferred.make<void>();
            const run = yield* onceScoped(
              Effect.gen(function* () {
                runs.count += 1;
                // The run interrupts its first caller as it starts, while that caller yields.
                if (runs.count === 1)
                  Option.map(caller.fiber, (fiber) => fiber.interruptUnsafe(fiber.id));
                return yield* Deferred.await(finish);
              }),
            );
            const first = yield* Effect.forkChild(
              Effect.withFiber((fiber) => {
                caller.fiber = Option.some(fiber);
                return run;
              }),
            );
            yield* Fiber.await(first);
            const second = yield* Effect.forkChild(run);
            yield* yieldFibers;
            yield* Deferred.done(finish, Exit.void);
            yield* Fiber.join(second);
            expect(state.yielded).toBe(true);
            expect(runs.count).toBe(1);
          }),
        ).pipe(Effect.provideService(Scheduler.Scheduler, scheduler));
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
