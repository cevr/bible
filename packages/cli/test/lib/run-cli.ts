import * as BunServices from '@effect/platform-bun/BunServices';
import { Command } from 'effect/unstable/cli';
import { ConfigProvider, Effect, Exit, Inspectable, Layer, Logger } from 'effect';
import { expect } from 'bun:test';

import { getCallSequence, type ServiceCall } from './sequence-recorder.js';
import { createTestLayer, type TestLayerConfig } from './test-layer.js';

/**
 * Result from running a CLI command.
 */
export interface RunCliResult {
  /** The exit status of the command */
  exit: Exit.Exit<void, unknown>;
  /** All recorded service calls in order */
  calls: ServiceCall[];
  /** Whether the command succeeded */
  success: boolean;
}

/**
 * Execute a CLI command with test layers and return results for assertions.
 *
 * This follows the Effect testing pattern of testing whole command flows:
 * - Execute actual commands with real argument parsing
 * - Provide mock layers for external dependencies
 * - Assert on the sequence of observable side effects
 *
 * @param command The CLI command to run
 * @param args Command arguments (without 'node' and script name)
 * @param config Test layer configuration
 * @returns Result with exit status and recorded calls
 */
// The composed test layer (BunServices + Logger + createTestLayer) provides
// every service these commands depend on at runtime. The type system can't
// always prove that — commands return concrete-but-structurally-distinct
// service identities that confuse `Exclude` simplification — so we narrow the
// residual context to `never` after Effect.provide. If a command actually
// references a service the test layer doesn't supply, the run will die at
// runtime; tests will catch it immediately.
export const runCli = <Name extends string, Input, ContextInput, E, R>(
  command: Command.Command<Name, Input, ContextInput, E, R>,
  args: string[],
  config: TestLayerConfig = {},
): Effect.Effect<RunCliResult> =>
  Effect.gen(function* () {
    const { layer, getAllCalls } = createTestLayer(config);
    // Use Command.runWith to pass args directly (v4 pattern)
    const cli = Command.runWith(command, { version: 'test' });

    // Always capture the call sequence, regardless of whether the CLI
    // succeeded or failed — failed runs still record observable side effects
    // before the failure point, and tests need to assert on them.
    const program = Effect.gen(function* () {
      const cliExit = yield* Effect.exit(cli(args));
      const calls = yield* getCallSequence;
      return { cliExit, calls };
    });

    // Suppress logs during tests unless debugging.
    // Order matters in Layer.mergeAll: later layers overwrite earlier ones for
    // shared services. The mock `layer` must come last so its FileSystem/Path
    // mocks beat BunServices' real implementations.
    const provider = ConfigProvider.fromUnknown({
      GEMINI_API_KEY: 'test-key',
      OPENAI_API_KEY: 'test-key',
      ANTHROPIC_API_KEY: 'test-key',
    });
    const provided = program.pipe(
      Effect.provide(Layer.mergeAll(BunServices.layer, Logger.layer([]), layer)),
      Effect.provideService(ConfigProvider.ConfigProvider, provider),
    ) as Effect.Effect<{ cliExit: Exit.Exit<void, unknown>; calls: ServiceCall[] }>;
    const result = yield* provided;

    const exit = result.cliExit;
    const effectCalls = result.calls;
    const success = Exit.isSuccess(exit);

    // Get all calls (services + external - model, http, bun)
    const allServiceCalls = getAllCalls();

    // Merge all calls - effect calls first, then service calls
    const calls = [...effectCalls, ...allServiceCalls];

    // Log failure details for debugging
    if (!success) {
      let failure: unknown = 'unknown';
      if (Exit.isFailure(exit)) {
        failure = exit.cause;
      }
      yield* Effect.logError(`CLI command failed: ${Inspectable.toStringUnknown(failure, 0)}`);
    }

    return {
      exit: Exit.map(exit, () => void 0),
      calls,
      success,
    };
  });

/**
 * Assertion helper for verifying call sequences.
 *
 * Checks that the expected calls appear in order within the actual calls.
 * Each expected call can be a partial match - only specified properties are checked.
 *
 * @param actual The actual recorded service calls
 * @param expected Expected calls in order (partial matches allowed)
 */
export const expectSequence = (actual: ServiceCall[], expected: Array<Partial<ServiceCall>>) => {
  let actualIndex = 0;

  for (const expectedCall of expected) {
    let found = false;

    while (actualIndex < actual.length) {
      const actualCall = actual[actualIndex];
      actualIndex++;

      if (actualCall === undefined) continue;

      if (actualCall._tag === expectedCall._tag) {
        // Check additional properties
        let matches = true;
        for (const [key, value] of Object.entries(expectedCall)) {
          if (key === '_tag') continue;

          const actualValue = (actualCall as Record<string, unknown>)[key];

          // Handle expect.stringContaining and other matchers
          if (value && typeof value === 'object' && 'asymmetricMatch' in value) {
            if (
              !(value as { asymmetricMatch: (v: unknown) => boolean }).asymmetricMatch(actualValue)
            ) {
              matches = false;
              break;
            }
          } else if (actualValue !== value) {
            matches = false;
            break;
          }
        }

        if (matches) {
          found = true;
          break;
        }
      }
    }

    expect(found).toBe(true);
  }
};

/**
 * Assert that a specific call type appears exactly N times.
 */
export const expectCallCount = (calls: ServiceCall[], tag: ServiceCall['_tag'], count: number) => {
  const actual = calls.filter((c) => c._tag === tag).length;
  expect(actual).toBe(count);
};

/**
 * Assert that no calls of a specific type were made.
 */
export const expectNoCalls = (calls: ServiceCall[], tag: ServiceCall['_tag']) => {
  expectCallCount(calls, tag, 0);
};

/**
 * Assert that all expected calls are present (order-independent).
 * Use this when you want to verify calls happened but don't care about order.
 *
 * @param actual The actual recorded service calls
 * @param expected Expected calls (partial matches allowed)
 */
export const expectContains = (actual: ServiceCall[], expected: Array<Partial<ServiceCall>>) => {
  for (const expectedCall of expected) {
    const found = actual.some((actualCall) => {
      if (actualCall._tag !== expectedCall._tag) return false;

      // Check additional properties
      for (const [key, value] of Object.entries(expectedCall)) {
        if (key === '_tag') continue;

        const actualValue = (actualCall as Record<string, unknown>)[key];

        // Handle expect.stringContaining and other matchers
        if (value && typeof value === 'object' && 'asymmetricMatch' in value) {
          if (
            !(value as { asymmetricMatch: (v: unknown) => boolean }).asymmetricMatch(actualValue)
          ) {
            return false;
          }
        } else if (actualValue !== value) {
          return false;
        }
      }
      return true;
    });

    expect(found).toBe(true);
  }
};
