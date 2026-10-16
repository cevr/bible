// Build the court's figure rigs (`figures.ts`: the accused, the judge, his
// hand) in the figures' direction (`DIRECTION`, `direction.ts`): write the
// generated project (`project/`), compile it with the Rive
// CLI offline and unsigned (`rive --once`: no account, no scripts), and copy
// the .riv beside the looks, where `rigs.ts` imports it. Fails when the CLI
// reports a problem.
// `bun looks/rive/build.ts [--inspect] [--screenshot]`, from the film's folder
// or anywhere: paths are this file's. The CLI is `rive` on the PATH, or the
// one `RIVE` names.
//
// Prints each step's wall time, so the agent loop (change → see it) is
// measured, not guessed.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Config, Console, Duration, Effect, FileSystem, Schema, Stream } from 'effect';
import { Command, Flag } from 'effect/cli';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { DIRECTION } from './direction.ts';
import { figuresRml } from './figures.ts';

const here = import.meta.dir;
const project = `${here}/project`;

/** What the CLI reports as wrong with a project: kept as it prints it. */
const Problems = Schema.Array(Schema.Unknown);
const ProblemsJson = Schema.fromJsonString(Problems);

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

/** `effect`, its wall time printed under `label`. */
const timed = <A, E, R>(label: string, effect: Effect.Effect<A, E, R>) =>
  Effect.timed(effect).pipe(
    Effect.tap(([took]) => Console.log(`${label}: ${Duration.toMillis(took).toFixed(0)} ms`)),
    Effect.map(([, out]) => out),
  );

/** Run the Rive CLI with `args`: its stdout, or `RiveFailed` with all it printed. */
export const rive = (step: string, args: ReadonlyArray<string>) =>
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
 * main artboard `main` (the court's accused unless named), and compile it
 * offline and unsigned (`rive --once`): the built file, its size, what the
 * build warned of and its problems.
 */
export const compile = Effect.fn('compile')(function* (dir: string, rml: string, main = 'Accused') {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(dir, { recursive: true });
  yield* fs.writeFileString(`${dir}/rive.yaml`, `name: figures\nmain: ${main}\n`);
  yield* fs.writeFileString(`${dir}/figures.rml`, rml);
  const printed = yield* rive('rive --once', [dir, '--once', '--quiet', '--format=json']);
  const report = yield* Schema.decodeEffect(Built)(printed.trim());
  return { ...report.data, warnings: report.warnings, problems: report.problems ?? [] };
});

const build = Effect.fn('build')(function* (options: {
  readonly inspect: boolean;
  readonly screenshot: boolean;
}) {
  const fs = yield* FileSystem.FileSystem;
  const rml = yield* timed(
    'generate',
    Effect.sync(() => figuresRml(DIRECTION)),
  );
  yield* Console.log(`figures.rml: ${rml.split('\n').length} lines, ${rml.length} bytes`);
  const built = yield* timed('rive --once', compile(project, rml));
  yield* Console.log(
    `riv: ${built.bytes} bytes; warnings: ${built.warnings.length}; problems: ${built.problems.length}`,
  );
  yield* Effect.forEach(built.warnings, (w) => Console.log(`  warning: ${w}`));
  if (built.problems.length > 0)
    return yield* RiveFailed.make({
      step: 'rive --once',
      output: yield* Schema.encodeEffect(ProblemsJson)(built.problems),
    });
  yield* fs.copyFile(built.riv, `${here}/figures.riv`);

  if (options.inspect) {
    const inspected = yield* timed(
      'rive inspect',
      rive('rive inspect', ['inspect', project, '--summary']).pipe(
        // `rive inspect` exits 1 though it prints its summary.
        Effect.catchTag('RiveFailed', (failed) => Effect.succeed(failed.output)),
      ),
    );
    yield* Console.log(inspected.trim());
  }
  if (options.screenshot) {
    yield* Effect.forEach(['0', '1'], (advance) =>
      timed(
        `rive --screenshot (advance ${advance})`,
        rive('rive --screenshot', [
          project,
          `--screenshot=${project}/build/shot-${advance}.png`,
          `--advance=${advance}`,
        ]),
      ).pipe(Effect.catchTag('RiveFailed', (failed) => Console.error(failed.message))),
    );
  }
});

const command = Command.make(
  'build',
  {
    inspect: Flag.Boolean('inspect').pipe(
      Flag.withDefault(false),
      Flag.withDescription('print `rive inspect --summary` of the built project'),
    ),
    screenshot: Flag.Boolean('screenshot').pipe(
      Flag.withDefault(false),
      Flag.withDescription('write project/build/shot-0.png and shot-1.png (advance 0 and 1)'),
    ),
  },
  build,
).pipe(Command.withDescription("Build the court's figure rigs into figures.riv beside the looks"));

// Run as a script; imported (the build test, `build.test.ts`), it only lends `compile`.
if (import.meta.main)
  Command.run(command, { version: '1.0.0' }).pipe(
    Effect.provide(BunServices.layer),
    BunRuntime.runMain,
  );
