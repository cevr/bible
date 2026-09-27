// Rive through its CLI (`rive`, a Homebrew cask): build a film's project to a
// .riv, read what it builds to, and move it to and from the Rive file the
// editor opens. A build and an inspect run offline; push, pull and whoami use
// the login `rive login` keeps. Every reply is decoded with Schema.

import { Context, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import { Inspected, type RiveDocument, riveDocument } from '../core/rive.ts';
import { RiveFailed, RiveMissing, RiveUnlinked } from './errors.ts';
import { type Finished, collect, isNotFound } from './process.ts';

const INSTALL = 'brew install --cask rive-app/tap/rive-cli';

/** `rive <dir> --once --format=json`: the one report a build prints on stdout. */
const BuildReport = Schema.fromJsonString(
  Schema.Struct({
    success: Schema.Boolean,
    data: Schema.Struct({
      riv: Schema.OptionFromNullOr(Schema.String),
      bytes: Schema.Finite,
    }),
    errors: Schema.Array(Schema.String),
    warnings: Schema.Array(Schema.String),
  }),
);

/** A build: the .riv it wrote, and what the compiler warned about. */
export interface Built {
  readonly riv: string;
  readonly bytes: number;
  readonly warnings: ReadonlyArray<string>;
}

export interface PushOptions {
  /** The Rive project a first push creates the file in; later pushes ignore it. */
  readonly project: Option.Option<string>;
  /** The revision's label in the file's history. */
  readonly name: Option.Option<string>;
}

export interface RiveService {
  /** The CLI's version: it is installed. */
  readonly version: Effect.Effect<string, RiveMissing | RiveFailed>;
  /** Who is signed in, if anyone. Reaches the network. */
  readonly whoami: Effect.Effect<Option.Option<string>, RiveMissing | RiveFailed>;
  /** Compile the project in `dir` to its .riv; fails on the first compile error, listing them all. */
  readonly build: (dir: string) => Effect.Effect<Built, RiveMissing | RiveFailed>;
  /** What the project in `dir` builds to, problems included: it fails only when the CLI does. */
  readonly inspect: (dir: string) => Effect.Effect<RiveDocument, RiveMissing | RiveFailed>;
  /** Write the linked Rive file over the project; returns what changed. */
  readonly pull: (dir: string) => Effect.Effect<string, RiveMissing | RiveFailed | RiveUnlinked>;
  /** Build the project and replace the linked Rive file's content with it; returns the CLI's report. */
  readonly push: (
    dir: string,
    options: PushOptions,
  ) => Effect.Effect<string, RiveMissing | RiveFailed | RiveUnlinked>;
}

/** Whether `rive.yaml` links the project to a Rive file (`push.fileId`). */
export const linked = (yaml: string): boolean => /^\s+fileId:\s*\d+\s*$/m.test(yaml);

export class Rive extends Context.Service<Rive, RiveService>()('@bible/film/tools/Rive') {
  /** Through the `rive` CLI. */
  static readonly layer = Layer.effect(
    Rive,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const classify = (op: string) => (error: PlatformError) => {
        if (isNotFound(error)) return RiveMissing.make({ install: INSTALL });
        return RiveFailed.make({ op, exitCode: -1, reason: error.message });
      };

      const run = (op: string, args: ReadonlyArray<string>) =>
        collect(spawner, ChildProcess.make('rive', [...args])).pipe(Effect.mapError(classify(op)));

      const refuse = (op: string, done: Finished) =>
        RiveFailed.make({
          op,
          exitCode: done.exitCode,
          reason: [done.stderr.trim(), done.stdout.trim()].filter((s) => s !== '').join('\n'),
        });

      /** Run and succeed only on exit 0, with stdout. */
      const exec = (op: string, args: ReadonlyArray<string>) =>
        run(op, args).pipe(
          Effect.filterOrFail(
            (done) => done.exitCode === 0,
            (done) => refuse(op, done),
          ),
          Effect.map((done) => done.stdout),
        );

      const decode = <A>(op: string, schema: Schema.Codec<A, string>, raw: string) =>
        Schema.decodeEffect(schema)(raw).pipe(
          Effect.mapError((error) =>
            RiveFailed.make({ op, exitCode: 0, reason: `${error.message}\n${raw.slice(0, 400)}` }),
          ),
        );

      const isLinked = (dir: string) =>
        fs.readFileString(path.join(dir, 'rive.yaml')).pipe(
          Effect.map(linked),
          Effect.orElseSucceed(() => false),
        );

      const version = exec('version', ['--version']).pipe(
        Effect.map((out) => out.trim().replace(/^rive\s+/, '')),
      );

      const whoami = run('whoami', ['whoami']).pipe(
        Effect.flatMap((done) => {
          const out = done.stdout.trim();
          if (done.exitCode === 0 && out !== '')
            return Effect.succeed(Option.some(out.split(/\s+/)[0] ?? out));
          if (/not logged in/i.test(`${done.stdout}\n${done.stderr}`))
            return Effect.succeed(Option.none<string>());
          return Effect.fail(refuse('whoami', done));
        }),
      );

      const build = Effect.fn('Rive.build')(function* (dir: string) {
        const done = yield* run('build', [dir, '--once', '--quiet', '--format=json']);
        const report = yield* decode('build', BuildReport, done.stdout.trim());
        if (!report.success || Option.isNone(report.data.riv))
          return yield* RiveFailed.make({
            op: 'build',
            exitCode: done.exitCode,
            reason: report.errors.join('\n'),
          });
        return {
          riv: path.resolve(report.data.riv.value),
          bytes: report.data.bytes,
          warnings: report.warnings,
        };
      });

      const inspect = Effect.fn('Rive.inspect')(function* (dir: string) {
        // A project with errors exits 1 and still prints its report: the report
        // is the answer, and only a run that prints none has failed.
        const done = yield* run('inspect', ['inspect', dir, '--json']);
        const inspected = yield* Schema.decodeEffect(Schema.fromJsonString(Inspected))(
          done.stdout,
        ).pipe(Effect.mapError(() => refuse('inspect', done)));
        return riveDocument(inspected);
      });

      const pull = Effect.fn('Rive.pull')(function* (dir: string) {
        if (!(yield* isLinked(dir))) return yield* RiveUnlinked.make({ dir });
        const out = yield* exec('pull', ['pull', dir, '--yes', '--quiet']);
        return out.trim();
      });

      const push = Effect.fn('Rive.push')(function* (dir: string, options: PushOptions) {
        if (Option.isNone(options.project) && !(yield* isLinked(dir)))
          return yield* RiveUnlinked.make({ dir });
        const out = yield* exec('push', [
          'push',
          dir,
          '--quiet',
          ...Option.toArray(Option.map(options.project, (id) => `--project=${id}`)),
          ...Option.toArray(Option.map(options.name, (label) => `--name=${label}`)),
        ]);
        return out.trim();
      });

      return Rive.of({ version, whoami, build, inspect, pull, push });
    }),
  );
}
