// One child process, run to completion: its exit code and everything it
// printed. The ElevenLabs and ffmpeg layers map a failure into their own
// typed errors; this module only runs and collects.

import { Effect, Stream } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import type { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

export interface Finished {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** A byte stream as text. */
export const text = (stream: Stream.Stream<Uint8Array, PlatformError>) =>
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

/** Whether a spawn failed because the program is not installed. */
export const isNotFound = (error: PlatformError): boolean =>
  error.reason._tag === 'NotFound' && error.reason.module === 'ChildProcess';
