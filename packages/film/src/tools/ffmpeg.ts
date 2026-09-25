// ffmpeg and ffprobe, as a service: a run either finishes cleanly or fails
// with the tool's own stderr, and a missing binary says how to install it.

import { Context, Effect, Layer, Schema } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import { FfmpegFailed, FfmpegMissing } from './errors.ts';
import { type Finished, collect, isNotFound } from './process.ts';

export type FfmpegError = FfmpegFailed | FfmpegMissing;

export interface FfmpegService {
  /** Run ffmpeg with these arguments (without the program name). */
  readonly run: (args: ReadonlyArray<string>) => Effect.Effect<void, FfmpegError>;
  /** A media file's duration in seconds. */
  readonly probeDuration: (file: string) => Effect.Effect<number, FfmpegError>;
}

export class Ffmpeg extends Context.Service<Ffmpeg, FfmpegService>()('@bible/film/tools/Ffmpeg') {
  static readonly layer = Layer.effect(
    Ffmpeg,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      const exec = (tool: string, args: ReadonlyArray<string>) =>
        collect(spawner, ChildProcess.make(tool, args)).pipe(
          Effect.mapError((error: PlatformError): FfmpegError => {
            if (isNotFound(error)) return FfmpegMissing.make({ tool });
            return FfmpegFailed.make({ tool, exitCode: -1, stderr: error.message });
          }),
          Effect.flatMap((done: Finished) => {
            if (done.exitCode === 0) return Effect.succeed(done.stdout);
            return Effect.fail(
              FfmpegFailed.make({ tool, exitCode: done.exitCode, stderr: done.stderr.trim() }),
            );
          }),
        );

      const run = Effect.fn('Ffmpeg.run')(function* (args: ReadonlyArray<string>) {
        yield* exec('ffmpeg', args);
      });

      const probeDuration = Effect.fn('Ffmpeg.probeDuration')(function* (file: string) {
        const out = yield* exec('ffprobe', [
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'csv=p=0',
          file,
        ]);
        return yield* Schema.decodeEffect(Schema.FiniteFromString)(out.trim()).pipe(
          Effect.mapError((error) =>
            FfmpegFailed.make({
              tool: 'ffprobe',
              exitCode: 0,
              stderr: `${file}: ${error.message}`,
            }),
          ),
        );
      });

      return Ffmpeg.of({ run, probeDuration });
    }),
  );
}
