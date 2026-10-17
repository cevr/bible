// Compile a figure project with the Rive CLI, offline and unsigned
// (`rive --once`: no account, no scripts): write the generated project, run
// the CLI on it, and answer the built file with what the build warned of and
// its problems. A film's rig build (`righteousness-by-faith/rigs/build.ts`)
// copies the file beside its rigs. The CLI is `rive` on the PATH, or the one
// `RIVE` names.

import { Config, Effect, FileSystem, Schema, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/** What the CLI reports as wrong with a project: kept as it prints it. */
const Problems = Schema.Array(Schema.Unknown);

/** What `rive --once --format=json` prints: the built file, what the build warned of, and its problems. */
const Built = Schema.fromJsonString(
  Schema.Struct({
    data: Schema.Struct({ riv: Schema.String, bytes: Schema.Finite }),
    warnings: Schema.Array(Schema.String),
    problems: Schema.optional(Problems),
  }),
);

/** The Rive CLI exited non-zero: what it printed. */
class RiveFailed extends Schema.TaggedError<RiveFailed>()('RiveFailed', {
  step: Schema.String,
  output: Schema.String,
}) {
  override get message() {
    return `${this.step} failed:\n${this.output}`;
  }
}

/** Run the Rive CLI with `args`: its stdout, or `RiveFailed` with all it printed. */
const rive = (step: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const bin = yield* Config.String('RIVE').pipe(Config.withDefault('rive'));
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(
      ChildProcess.make(bin, args, { forceKillAfter: '5 seconds' }),
    );
    const [stdout, stderr, code] = yield* Effect.all(
      [
        Stream.mkString(Stream.decodeText(handle.stdout)),
        Stream.mkString(Stream.decodeText(handle.stderr)),
        handle.exitCode,
      ],
      { concurrency: 3 },
    );
    if (code !== 0) return yield* RiveFailed.make({ step, output: `${stdout}${stderr}` });
    return stdout;
  }).pipe(Effect.scoped);

/**
 * Write `rml` as the project in `dir` (`rive.yaml` and `figures.rml`), its
 * main artboard `main`, and compile it offline and unsigned (`rive --once`):
 * the built file, its size, what the build warned of and its problems.
 */
export const compile = Effect.fn('compile')(function* (dir: string, rml: string, main: string) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(dir, { recursive: true });
  yield* fs.writeFileString(`${dir}/rive.yaml`, `name: figures\nmain: ${main}\n`);
  yield* fs.writeFileString(`${dir}/figures.rml`, rml);
  const printed = yield* rive('rive --once', [dir, '--once', '--quiet', '--format=json']);
  const report = yield* Schema.decodeEffect(Built)(printed.trim());
  return { ...report.data, warnings: report.warnings, problems: report.problems ?? [] };
});
