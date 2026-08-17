import * as BunServices from '@effect/platform-bun/BunServices';
import { Command } from 'effect/unstable/cli';
import {
  ConfigProvider,
  Console,
  Effect,
  Exit,
  Inspectable,
  Layer,
  Logger,
  Option,
  Predicate,
} from 'effect';
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
  /**
   * Everything the command wrote through `Console.log`, joined with newlines.
   *
   * A command's stdout is a contract with the scripts and agents that pipe it,
   * and asserting on the payload a helper *would* produce leaves the last hop —
   * helper to `Console.log` — untested. That hop is where a hand-written
   * projection can reappear. Captured here rather than per test so any command
   * test can assert on real output.
   */
  stdout: string;
  /**
   * Everything the command wrote through `Console.error`, joined with newlines.
   *
   * Diagnostics belong here rather than in {@link stdout} — `--json` pipes
   * stdout and a diagnostic line in that stream corrupts the payload a script
   * is parsing — so a command whose only job on failure is to name what broke
   * writes nothing a stdout assertion can see. Captured for the same reason
   * stdout is: the last hop, helper to console, is where a message can be
   * dropped.
   */
  stderr: string;
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

    // Real stdout, captured rather than printed. `Console.Console` is a
    // `Context.Reference` whose default is the host's own `globalThis.console`,
    // so overriding it substitutes the sink every `Console.log` in the command
    // graph already writes to — no command has to be written differently to be
    // observable. `log` returns `void` rather than an `Effect` because
    // `Console.log` wraps the plain method in `Effect.sync` itself.
    const written: string[] = [];
    const diagnostics: string[] = [];
    const recordingConsole: Console.Console = {
      ...Console.Console.defaultValue(),
      log: (...parts: readonly unknown[]) => {
        written.push(parts.map((part) => String(part)).join(' '));
      },
      error: (...parts: readonly unknown[]) => {
        diagnostics.push(parts.map((part) => String(part)).join(' '));
      },
    };

    // Always capture the call sequence, regardless of whether the CLI
    // succeeded or failed — failed runs still record observable side effects
    // before the failure point, and tests need to assert on them.
    const program = Effect.gen(function* () {
      const cliExit = yield* Effect.exit(
        cli(args).pipe(Effect.provideService(Console.Console, recordingConsole)),
      );
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
    // @effect-diagnostics-next-line unsafeEffectTypeAssertion:off
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
    if (Exit.isFailure(exit)) {
      yield* Effect.logError(`CLI command failed: ${Inspectable.toStringUnknown(exit.cause, 0)}`);
    }

    return {
      exit: Exit.map(exit, () => void 0),
      calls,
      success,
      stdout: written.join('\n'),
      stderr: diagnostics.join('\n'),
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
      const actualCallOpt = Option.fromNullishOr(actual[actualIndex]);
      actualIndex++;

      if (Option.isNone(actualCallOpt)) continue;
      const actualCall = actualCallOpt.value;

      if (actualCall._tag === expectedCall._tag) {
        // Check additional properties
        let matches = true;
        for (const [key, value] of Object.entries(expectedCall)) {
          if (key === '_tag') continue;

          const actualValue: unknown = Reflect.get(actualCall, key);

          // Handle expect.stringContaining and other matchers
          if (Predicate.hasProperty(value, 'asymmetricMatch')) {
            if (!(value as { asymmetricMatch: (v: any) => boolean }).asymmetricMatch(actualValue)) {
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

        const actualValue: unknown = Reflect.get(actualCall, key);

        // Handle expect.stringContaining and other matchers
        if (Predicate.hasProperty(value, 'asymmetricMatch')) {
          if (!(value as { asymmetricMatch: (v: any) => boolean }).asymmetricMatch(actualValue)) {
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
