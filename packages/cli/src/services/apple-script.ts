import Bun from 'bun';
import { Effect, Layer, Context } from 'effect';
import type { Cause } from 'effect';

/**
 * Service for executing AppleScript commands.
 */
export interface AppleScriptService {
  /**
   * Execute an AppleScript command.
   * @param script The AppleScript code to execute
   * @returns The stdout output from the script
   */
  readonly exec: (script: string) => Effect.Effect<string, Cause.UnknownError>;
}

export class AppleScript extends Context.Service<AppleScript, AppleScriptService>()(
  '@bible/cli/services/apple-script/AppleScript',
) {}

/**
 * Live implementation using Bun.spawn to call osascript.
 */
export const AppleScriptLive = Layer.succeed(AppleScript, {
  exec: (script: string) =>
    Effect.tryPromise({
      try: async () => {
        const child = Bun.spawn(['osascript', '-e', script]);
        const text = await new Response(child.stdout).text();
        return text;
      },
      catch: (error) => error as Cause.UnknownError,
    }),
});
