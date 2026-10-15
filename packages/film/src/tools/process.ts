// One child process, run to completion: its exit code and everything it
// printed. The ElevenLabs layer maps a failure into its own typed errors;
// this module only runs and collects.

import { Duration, Effect, FileSystem, Stream } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import type { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { ProcessTimedOut } from './errors.ts';

export interface Finished {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** A byte stream as text. */
const text = (stream: Stream.Stream<Uint8Array, PlatformError>) =>
  Stream.mkString(Stream.decodeText(stream));

/** Run `command` and collect its output; stdout and stderr drain together so neither blocks. */
export const collect = (
  spawner: ChildProcessSpawner.ChildProcessSpawner['Service'],
  command: ChildProcess.Command,
): Effect.Effect<Finished, PlatformError> =>
  Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(command);
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [text(handle.stdout), text(handle.stderr), handle.exitCode],
        { concurrency: 3 },
      );
      return { exitCode, stdout, stderr };
    }),
  );

/**
 * `collect`, bounded: a process still running after `limit` is interrupted
 * (its scope closes, which kills it) and the run fails as `ProcessTimedOut`,
 * which calls it `name`.
 */
export const collectWithin = (
  spawner: ChildProcessSpawner.ChildProcessSpawner['Service'],
  name: string,
  command: ChildProcess.Command,
  limit: Duration.Duration,
): Effect.Effect<Finished, PlatformError | ProcessTimedOut> =>
  collect(spawner, command).pipe(
    Effect.timeoutOrElse({
      duration: limit,
      orElse: () =>
        Effect.fail(ProcessTimedOut.make({ command: name, seconds: Duration.toSeconds(limit) })),
    }),
  );

/** Where a run's two streams are written as they arrive. */
export interface Outputs {
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * `collectWithin`, its stdout and stderr written to `outputs` chunk by chunk
 * as they arrive rather than held, so a run that fails, is stopped at
 * `limit` or is interrupted keeps what it printed: its exit code. The files
 * are made once the process starts; a spawn that fails makes none.
 */
export const runInto = (
  spawner: ChildProcessSpawner.ChildProcessSpawner['Service'],
  name: string,
  command: ChildProcess.Command,
  limit: Duration.Duration,
  outputs: Outputs,
): Effect.Effect<number, PlatformError | ProcessTimedOut, FileSystem.FileSystem> =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const handle = yield* spawner.spawn(command);
      const [, , exitCode] = yield* Effect.all(
        [
          Stream.run(handle.stdout, fs.sink(outputs.stdout)),
          Stream.run(handle.stderr, fs.sink(outputs.stderr)),
          handle.exitCode,
        ],
        { concurrency: 3 },
      );
      return exitCode;
    }),
  ).pipe(
    Effect.timeoutOrElse({
      duration: limit,
      orElse: () =>
        Effect.fail(ProcessTimedOut.make({ command: name, seconds: Duration.toSeconds(limit) })),
    }),
  );

/** Whether a spawn failed because the program is not installed. */
export const isNotFound = (error: PlatformError): boolean =>
  error.reason._tag === 'NotFound' && error.reason.module === 'ChildProcess';
