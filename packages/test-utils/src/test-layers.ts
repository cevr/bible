/**
 * Test Layers - Helpers for creating test layers
 *
 * Provides utilities for creating mock service layers that record calls.
 * Service-specific layers should be defined in the package that owns the service.
 */

import type { Context } from 'effect';
import { Effect, Layer, Option, Ref } from 'effect';

import {
  CallSequence,
  CallSequenceLayer,
  recordCall,
  type CallField,
  type ServiceCall,
} from './sequence-recorder.js';

// ============================================================================
// Generic Test Layer Factory
// ============================================================================

/**
 * Recordable arguments extracted from a service method call.
 */
type CallArgs = Record<string, CallField>;

/**
 * Create a recording test layer for any service.
 *
 * @example
 * ```ts
 * // Define your service methods
 * interface MyServiceMethods {
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
  Methods extends Record<string, (...args: never[]) => Effect.Effect<unknown, unknown, unknown>>,
>(
  tag: Tag,
  implementation: {
    [K in keyof Methods]: (
      ...args: Parameters<Methods[K]>
    ) => Effect.Effect<
      Effect.Success<ReturnType<Methods[K]>>,
      Effect.Error<ReturnType<Methods[K]>>
    >;
  },
  extractArgs: {
    [K in keyof Methods]?: (...args: Parameters<Methods[K]>) => CallArgs;
  },
): Layer.Layer<Context.Service.Identifier<Tag>, never, CallSequence> => {
  const tagName = tag.key;

  const service: Record<
    string,
    (...args: never[]) => Effect.Effect<unknown, unknown, CallSequence>
  > = {};

  for (const [key, fn] of Object.entries(implementation)) {
    service[key] = (...args: never[]) =>
      Effect.gen(function* () {
        const extractFn = Option.fromUndefinedOr(extractArgs[key as keyof typeof extractArgs]);
        const callArgs = Option.match(extractFn, {
          onNone: (): CallArgs => ({}),
          onSome: (extract) => (extract as unknown as (...a: never[]) => CallArgs)(...args),
        });
        yield* recordCall({
          _tag: `${tagName}.${key}`,
          ...callArgs,
        });
        return yield* (fn as (...a: never[]) => Effect.Effect<unknown, unknown>)(...args);
      });
  }

  return Layer.succeed(tag, service as unknown as Tag['Service']);
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
export const runWithCallSequence = <A, E>(
  effect: Effect.Effect<A, E, CallSequence>,
): Effect.Effect<{ result: A; calls: ServiceCall[] }, E> =>
  Effect.gen(function* () {
    const result = yield* effect;
    const callRef = yield* CallSequence;
    const calls = yield* Ref.get(callRef);
    return { result, calls };
  }).pipe(Effect.provide(CallSequenceLayer));

// Re-export for convenience
export { CallSequence, CallSequenceLayer, recordCall };
