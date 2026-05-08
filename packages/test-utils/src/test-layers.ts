/**
 * Test Layers - Helpers for creating test layers
 *
 * Provides utilities for creating mock service layers that record calls.
 * Service-specific layers should be defined in the package that owns the service.
 */

import type { Context } from 'effect';
import { Effect, Layer, Ref } from 'effect';

import {
  CallSequence,
  CallSequenceLayer,
  recordCall,
  type ServiceCall,
} from './sequence-recorder.js';

// ============================================================================
// Generic Test Layer Factory
// ============================================================================

/**
 * Create a recording test layer for any service.
 *
 * @example
 * ```ts
 * // Define your service shape
 * interface MyServiceShape {
 *   readonly doThing: (x: number) => Effect.Effect<string, MyError>;
 * }
 *
 * // Create test layer that records calls
 * const MyServiceTest = createRecordingTestLayer(
 *   MyService,
 *   {
 *     doThing: (x) => Effect.succeed(`result: ${x}`),
 *   },
 *   {
 *     doThing: (x) => ({ x }),
 *   }
 * );
 * ```
 */
export const createRecordingTestLayer = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic type param requires any
  Tag extends Context.Key<any, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic type param requires any
  Shape extends Record<string, (...args: never[]) => Effect.Effect<unknown, unknown, unknown>>,
>(
  tag: Tag,
  implementation: {
    [K in keyof Shape]: (
      ...args: Parameters<Shape[K]>
    ) => Effect.Effect<Effect.Success<ReturnType<Shape[K]>>, Effect.Error<ReturnType<Shape[K]>>>;
  },
  extractArgs: {
    [K in keyof Shape]?: (...args: Parameters<Shape[K]>) => Record<string, unknown>;
  },
): Layer.Layer<Context.Service.Identifier<Tag>, never, CallSequence> => {
  const tagName = (tag as unknown as { key: string }).key ?? 'UnknownService';

  return Layer.effect(
    tag,
    Effect.sync(() => {
      const service: Record<string, unknown> = {};

      for (const [key, fn] of Object.entries(implementation)) {
        service[key] = (...args: unknown[]) =>
          Effect.gen(function* () {
            const extractFn = extractArgs[key as keyof typeof extractArgs] as
              | ((...a: unknown[]) => Record<string, unknown>)
              | undefined;
            const callArgs = extractFn ? extractFn(...args) : {};
            yield* recordCall({
              _tag: `${tagName}.${key}`,
              ...callArgs,
            } as ServiceCall);
            return yield* (fn as (...a: unknown[]) => Effect.Effect<unknown, unknown>)(...args);
          });
      }

      return service as Context.Service.Shape<Tag>;
    }),
  );
};

// ============================================================================
// Test Runner Helper
// ============================================================================

/**
 * Run an effect with call sequence tracking.
 *
 * Wraps the effect in CallSequenceLayer and returns both the result
 * and the recorded calls.
 *
 * @example
 * ```ts
 * const { result, calls } = await runWithCallSequence(
 *   myEffect.pipe(Effect.provide(MyServiceTest))
 * );
 *
 * assertSequence(calls, [
 *   { _tag: 'MyService.doThing', x: 42 },
 * ]);
 * ```
 */
export const runWithCallSequence = async <A, E>(
  effect: Effect.Effect<A, E, CallSequence>,
): Promise<{ result: A; calls: ServiceCall[] }> => {
  const program = Effect.gen(function* () {
    const result = yield* effect;
    const callRef = yield* CallSequence;
    const calls = yield* Ref.get(callRef);
    return { result, calls };
  });

  return Effect.runPromise(program.pipe(Effect.provide(CallSequenceLayer)));
};

// Re-export for convenience
export { CallSequence, CallSequenceLayer, recordCall };
