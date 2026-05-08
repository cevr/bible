/**
 * Sequence Recorder - Track service calls during tests
 *
 * Provides a shared Ref for recording all service calls made during a test.
 * This enables asserting on the sequence of observable side effects.
 */

import { Context, Effect, Layer, Ref } from 'effect';

/**
 * Base service call type - extend for specific services
 */
export interface BaseServiceCall {
  readonly _tag: string;
  readonly [key: string]: unknown;
}

/**
 * Generic service call type for recording
 */
export type ServiceCall<T extends string = string> = BaseServiceCall & {
  readonly _tag: T;
};

/**
 * Context tag for the call sequence Ref.
 * Used to track all service calls made during a test.
 */
export class CallSequence extends Context.Service<CallSequence, Ref.Ref<ServiceCall[]>>()(
  'test/CallSequence',
) {}

/**
 * Record a service call to the sequence.
 */
export const recordCall = <T extends string>(call: ServiceCall<T>) =>
  Effect.gen(function* () {
    const ref = yield* CallSequence;
    yield* Ref.update(ref, (calls) => [...calls, call]);
  });

/**
 * Get all recorded calls.
 */
export const getCallSequence = Effect.gen(function* () {
  const ref = yield* CallSequence;
  return yield* Ref.get(ref);
});

/**
 * Clear all recorded calls.
 */
export const clearCallSequence = Effect.gen(function* () {
  const ref = yield* CallSequence;
  yield* Ref.set(ref, []);
});

/**
 * Layer that provides an empty call sequence.
 */
export const CallSequenceLayer = Layer.effect(CallSequence, Ref.make<ServiceCall[]>([]));

/**
 * Create a recording wrapper for a service method.
 * Records the call before delegating to the actual implementation.
 */
export const withRecording = <T extends string, Args extends unknown[], R>(
  tag: T,
  method: (...args: Args) => Effect.Effect<R, unknown, unknown>,
  extractArgs: (...args: Args) => Omit<ServiceCall<T>, '_tag'>,
) =>
  ((...args: Args) =>
    Effect.gen(function* () {
      yield* recordCall({ _tag: tag, ...extractArgs(...args) } as ServiceCall<T>);
      return yield* method(...args);
    })) as (...args: Args) => Effect.Effect<R, unknown, CallSequence>;
