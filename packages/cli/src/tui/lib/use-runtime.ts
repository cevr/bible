// @effect-diagnostics strictBooleanExpressions:off
/**
 * useRuntime hook for Effect integration with Solid.js
 *
 * Provides call/cast helpers for running Effects within components.
 * Based on gent's atom-solid pattern.
 */

import type { Effect, ManagedRuntime } from 'effect';
import { Cause, Exit, Fiber } from 'effect';
import { createSignal, onCleanup } from 'solid-js';
import type { Accessor } from 'solid-js';

import { Result } from './result.js';
import type { Result as ResultType } from './result.js';

/**
 * Hook for running Effects with a given ManagedRuntime
 */
export function useRuntime<R, ER>(runtime: ManagedRuntime.ManagedRuntime<R, ER>) {
  /**
   * Tracked execution - returns [result accessor, cancel function]
   *
   * The result accessor is reactive and will update when the effect completes.
   * Call cancel() to interrupt the fiber.
   */
  const call = <A, E>(
    effect: Effect.Effect<A, E, R>,
  ): readonly [Accessor<ResultType<A, E | ER>>, () => void] => {
    const [result, setResult] = createSignal<ResultType<A, E | ER>>(Result.initial(true));

    const fiber = runtime.runFork(effect);

    fiber.addObserver((exit) => {
      if (Exit.isSuccess(exit)) {
        setResult(Result.success(exit.value));
      } else {
        setResult(Result.failure(exit.cause));
      }
    });

    const cancel = () => {
      runtime.runFork(Fiber.interrupt(fiber));
    };

    // Auto-cleanup on component unmount
    onCleanup(cancel);

    return [result, cancel] as const;
  };

  /**
   * Fire-and-forget execution - no tracking
   *
   * Use this for side effects that don't need to be displayed in the UI.
   */
  const cast = <A, E>(effect: Effect.Effect<A, E, R>): void => {
    runtime.runFork(effect);
  };

  /**
   * Run effect and return promise
   *
   * Useful for event handlers that need to await completion.
   */
  const run = <A, E>(effect: Effect.Effect<A, E, R>): Promise<A> => {
    return runtime.runPromise(effect);
  };

  /**
   * Run effect and return exit promise
   *
   * Useful when you need to handle both success and failure.
   */
  const runExit = <A, E>(effect: Effect.Effect<A, E, R>): Promise<Exit.Exit<A, E | ER>> => {
    return runtime.runPromiseExit(effect);
  };

  return { call, cast, run, runExit };
}

/**
 * Create a reactive effect runner for a specific effect
 */
export function useEffectRunner<R, ER, Args extends unknown[], A, E>(
  runtime: ManagedRuntime.ManagedRuntime<R, ER>,
  effectFn: (...args: Args) => Effect.Effect<A, E, R>,
): readonly [Accessor<ResultType<A, E | ER>>, (...args: Args) => void] {
  const [result, setResult] = createSignal<ResultType<A, E | ER>>(Result.initial());
  let currentFiber: Fiber.Fiber<A, E | ER> | null = null;

  const run = (...args: Args) => {
    // Cancel previous run if still in progress
    if (currentFiber) {
      runtime.runFork(Fiber.interrupt(currentFiber));
    }

    // Mark as waiting
    setResult((prev) => Result.waiting(prev));

    const effect = effectFn(...args);
    currentFiber = runtime.runFork(effect);

    currentFiber.addObserver((exit: Exit.Exit<A, E | ER>) => {
      currentFiber = null;
      if (Exit.isSuccess(exit)) {
        setResult(Result.success(exit.value));
      } else {
        // Only set failure if not interrupted
        if (!Cause.hasInterruptsOnly(exit.cause)) {
          setResult(Result.failure(exit.cause));
        }
      }
    });
  };

  // Cleanup on unmount
  onCleanup(() => {
    if (currentFiber) {
      runtime.runFork(Fiber.interrupt(currentFiber));
    }
  });

  return [result, run] as const;
}
