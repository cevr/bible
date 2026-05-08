import { Cause, Effect, Layer } from 'effect';

import { AppleScript, type AppleScriptService } from '../../src/services/apple-script.js';
import type { ServiceCall } from './sequence-recorder.js';

/**
 * Configuration for mock AppleScript responses.
 */
export interface MockAppleScriptConfig {
  /** Whether AppleScript commands should succeed */
  success?: boolean;
  /** Response text from AppleScript */
  response?: string;
}

/**
 * State for tracking AppleScript calls.
 */
export interface MockAppleScriptState {
  calls: ServiceCall[];
}

/**
 * Create a mock AppleScript layer that records all calls.
 */
export const createMockAppleScriptLayer = (
  config: MockAppleScriptConfig = {},
  state: MockAppleScriptState,
) => {
  const service: AppleScriptService = {
    exec: (script: string) =>
      Effect.gen(function* () {
        state.calls.push({ _tag: 'AppleScript.exec', script });

        if (config.success === false) {
          return yield* new Cause.UnknownError('AppleScript execution failed');
        }

        return config.response ?? 'Success';
      }),
  };

  return Layer.succeed(AppleScript, service);
};
