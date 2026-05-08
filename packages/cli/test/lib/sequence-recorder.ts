import { Effect, Layer, Ref, Context } from 'effect';

/**
 * Types for recorded service calls.
 * Each call captures the service, method, and relevant arguments.
 */
export type ServiceCall =
  | { _tag: 'FileSystem.readFile'; path: string }
  | { _tag: 'FileSystem.readFileString'; path: string }
  | { _tag: 'FileSystem.writeFile'; path: string }
  | { _tag: 'FileSystem.writeFileString'; path: string; content: string }
  | { _tag: 'FileSystem.exists'; path: string }
  | { _tag: 'FileSystem.makeDirectory'; path: string }
  | { _tag: 'FileSystem.readDirectory'; path: string }
  | { _tag: 'FileSystem.remove'; path: string }
  | { _tag: 'Model.generateText'; model: 'high' | 'low'; prompt: string }
  | { _tag: 'Model.generateObject'; model: 'high' | 'low'; prompt: string }
  | { _tag: 'AI.generateText'; model: 'high' | 'low'; prompt: string }
  | { _tag: 'AI.generateTextWithTools'; model: 'high' | 'low'; prompt: string }
  | { _tag: 'AI.generateObject'; model: 'high' | 'low'; prompt: string }
  | { _tag: 'HTTP.fetch'; url: string }
  | { _tag: 'AppleScript.exec'; script: string }
  | { _tag: 'Console.log'; message: string }
  | { _tag: 'Chime.play' };

/**
 * Context tag for the call sequence Ref.
 * This is used to track all service calls made during a test.
 */
export class CallSequence extends Context.Service<CallSequence, Ref.Ref<ServiceCall[]>>()(
  'test/CallSequence',
) {}

/**
 * Record a service call to the sequence.
 */
export const recordCall = (call: ServiceCall) =>
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
