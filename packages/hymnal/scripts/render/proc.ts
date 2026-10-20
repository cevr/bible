/**
 * The render's child processes and its one error: a command run to its end
 * with its output kept, and a failure that names its step and says why.
 */

import { Effect, Schema, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

/** A step of the render that could not be done: its name and the tool's own words. */
export class RenderFailed extends Schema.TaggedError<RenderFailed>()('RenderFailed', {
  step: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.step}: ${this.reason}`;
  }
}

/** `command` run to its end in `cwd`: its exit code and both outputs as text. */
export const run = (command: string, args: ReadonlyArray<string>, cwd?: string) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner;
    const child = yield* spawner.spawn(
      ChildProcess.make(command, args, { cwd, forceKillAfter: '5 seconds' }),
    );
    const [stdout, stderr, code] = yield* Effect.all(
      [
        Stream.mkString(Stream.decodeText(child.stdout)),
        Stream.mkString(Stream.decodeText(child.stderr)),
        child.exitCode,
      ],
      { concurrency: 3 },
    );
    return { stdout, stderr, code: Number(code) };
  }).pipe(
    Effect.scoped,
    Effect.mapError((error) =>
      RenderFailed.make({ step: command, reason: `could not run: ${error.message}` }),
    ),
  );

/** `command` run to its end; a non-zero exit fails as `step` with the last of its output. */
export const runOk = (step: string, command: string, args: ReadonlyArray<string>, cwd?: string) =>
  run(command, args, cwd).pipe(
    Effect.filterOrFail(
      (out) => out.code === 0,
      (out) =>
        RenderFailed.make({
          step,
          reason: `exit ${out.code}: ${`${out.stdout}\n${out.stderr}`.trim().slice(-3000)}`,
        }),
    ),
  );
