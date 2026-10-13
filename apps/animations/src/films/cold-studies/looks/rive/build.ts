// Build the court's figure rigs (`figures.ts`: the accused, the judge, his
// hand): write the generated project (`project/`), compile it with the Rive
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
const rive = (step: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const bin = yield* Config.String('RIVE').pipe(Config.withDefault('rive'));
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(ChildProcess.make(bin, args));
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

const build = Effect.fn('build')(function* (options: {
  readonly inspect: boolean;
  readonly screenshot: boolean;
}) {
  const fs = yield* FileSystem.FileSystem;
  const rml = yield* timed(
    'generate',
    Effect.sync(() => figuresRml(DIRECTION)),
  );
  yield* fs.makeDirectory(project, { recursive: true });
  yield* fs.writeFileString(`${project}/rive.yaml`, 'name: figures\nmain: Accused\n');
  yield* fs.writeFileString(`${project}/figures.rml`, rml);
  yield* Console.log(`figures.rml: ${rml.split('\n').length} lines, ${rml.length} bytes`);

  const printed = yield* timed(
    'rive --once',
    rive('rive --once', [project, '--once', '--quiet', '--format=json']),
  );
  const report = yield* Schema.decodeEffect(Built)(printed.trim());
  const problems = report.problems ?? [];
  yield* Console.log(
    `riv: ${report.data.bytes} bytes; warnings: ${report.warnings.length}; problems: ${problems.length}`,
  );
  yield* Effect.forEach(report.warnings, (w) => Console.log(`  warning: ${w}`));
  if (problems.length > 0)
    return yield* RiveFailed.make({
      step: 'rive --once',
      output: yield* Schema.encodeEffect(ProblemsJson)(problems),
    });
  yield* fs.copyFile(report.data.riv, `${here}/figures.riv`);

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

Command.run(command, { version: '1.0.0' }).pipe(
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
