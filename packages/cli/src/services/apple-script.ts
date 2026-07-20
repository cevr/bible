import { Cause, Context, Effect, Layer, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

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
 * Live implementation using the Effect child-process service.
 */
export const AppleScriptLive = Layer.effect(
  AppleScript,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const exec = (script: string) =>
      spawner
        .string(ChildProcess.make('osascript', ['-e', script]))
        .pipe(Effect.mapError((cause) => new Cause.UnknownError(cause)));
    const execJxa = (script: string) =>
      Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* spawner.spawn(
            ChildProcess.make('osascript', ['-l', 'JavaScript', '-e', script]),
          );
          const [out, err, code] = yield* Effect.all(
            [
              Stream.decodeText(handle.stdout).pipe(Stream.mkString),
              Stream.decodeText(handle.stderr).pipe(Stream.mkString),
              handle.exitCode,
            ],
            { concurrency: 'unbounded' },
          );
          if (code !== 0) {
            return yield* new Cause.UnknownError(
              `osascript (JXA) exited ${code}: ${err.trim() || out.trim()}`,
            );
          }
          return out;
        }),
      ).pipe(Effect.mapError((cause) => new Cause.UnknownError(cause)));
    return AppleScript.of({ exec, execJxa });
  }),
);
