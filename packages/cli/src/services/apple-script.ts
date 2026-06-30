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

  /**
   * Execute a JavaScript-for-Automation (JXA) script via `osascript -l JavaScript`.
   * Captures stdout AND stderr and checks the exit code, throwing on non-zero so
   * deck-not-found / automation-denied (-1743) surface as a typed Effect failure
   * rather than an empty-string success. Returns stdout (expected: one JSON line).
   */
  readonly execJxa: (script: string) => Effect.Effect<string, Cause.UnknownError>;
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
  execJxa: (script: string) =>
    Effect.tryPromise({
      try: async () => {
        const child = Bun.spawn(['osascript', '-l', 'JavaScript', '-e', script], {
          stdout: 'pipe',
          stderr: 'pipe',
        });
        const [out, err] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);
        const code = await child.exited;
        if (code !== 0) {
          throw new Error(`osascript (JXA) exited ${code}: ${err.trim() || out.trim()}`);
        }
        return out;
      },
      catch: (error) => error as Cause.UnknownError,
    }),
});
