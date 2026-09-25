// ffmpeg and ffprobe, as a service: a run either finishes cleanly or fails
// with the tool's own stderr, and a missing binary says how to install it.
// `encode` feeds a stream of bytes to ffmpeg's stdin, waiting for the pipe to
// drain, and kills the child when its scope closes (a failure, an interrupt).

import { Context, Data, Duration, Effect, Fiber, Layer, Schema, Sink, Stream } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import { FfmpegFailed, FfmpegMissing } from './errors.ts';
import { type Finished, collect, isNotFound, text } from './process.ts';

export type FfmpegError = FfmpegFailed | FfmpegMissing;

export interface FfmpegService {
  /** Run ffmpeg with these arguments (without the program name). */
  readonly run: (args: ReadonlyArray<string>) => Effect.Effect<void, FfmpegError>;
  /** A media file's duration in seconds. */
  readonly probeDuration: (file: string) => Effect.Effect<number, FfmpegError>;
  /**
   * Run ffmpeg reading `input` on stdin (`-i -`). The stream is pulled only
   * as fast as ffmpeg drains the pipe; a stream failure kills ffmpeg.
   */
  readonly encode: <E, R>(
    args: ReadonlyArray<string>,
    input: Stream.Stream<Uint8Array, E, R>,
  ) => Effect.Effect<void, FfmpegError | E, R>;
}

/** How long an interrupted encoder gets to exit on SIGTERM before SIGKILL. */
const ENCODER_GRACE = Duration.seconds(1);

/** ffmpeg closed its stdin early; its exit code and stderr say why. */
class StdinClosed extends Data.TaggedError('StdinClosed') {}

export class Ffmpeg extends Context.Service<Ffmpeg, FfmpegService>()('@bible/film/tools/Ffmpeg') {
  static readonly layer = Layer.effect(
    Ffmpeg,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      const spawnFailed =
        (tool: string) =>
        (error: PlatformError): FfmpegError => {
          if (isNotFound(error)) return FfmpegMissing.make({ tool });
          return FfmpegFailed.make({ tool, exitCode: -1, stderr: error.message });
        };

      const exec = (tool: string, args: ReadonlyArray<string>) =>
        collect(spawner, ChildProcess.make(tool, args)).pipe(
          Effect.mapError(spawnFailed(tool)),
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

      const encode = <E, R>(args: ReadonlyArray<string>, input: Stream.Stream<Uint8Array, E, R>) =>
        Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* spawner
              .spawn(
                ChildProcess.make('ffmpeg', args, {
                  stdin: 'pipe',
                  stdout: 'ignore',
                  // ffmpeg blocked reading an open stdin ignores SIGTERM; a closing
                  // scope must not wait on it forever.
                  forceKillAfter: ENCODER_GRACE,
                }),
              )
              .pipe(Effect.mapError(spawnFailed('ffmpeg')));
            const stderr = yield* Effect.forkScoped(
              Effect.orElseSucceed(text(handle.stderr), () => ''),
            );
            const stdin = handle.stdin.pipe(Sink.mapError(() => new StdinClosed()));
            const closedEarly = yield* Stream.run(input, stdin).pipe(
              Effect.as(false),
              Effect.catchIf(
                (error): error is StdinClosed => error instanceof StdinClosed,
                () => Effect.succeed(true),
              ),
            );
            const exitCode = yield* handle.exitCode.pipe(Effect.mapError(spawnFailed('ffmpeg')));
            if (exitCode === 0 && !closedEarly) return;
            const said = (yield* Fiber.join(stderr)).trim();
            return yield* FfmpegFailed.make({
              tool: 'ffmpeg',
              exitCode,
              stderr: said || 'closed its input before the last frame',
            });
          }),
        ).pipe(Effect.withSpan('Ffmpeg.encode'));

      return Ffmpeg.of({ run, probeDuration, encode });
    }),
  );
}
