#!/usr/bin/env bun
// Every TypeScript file under packages/scripts is in the scripts tsconfig's
// program, so `tsc --noEmit` checks it. Asks tsc for the program's files
// (`--listFilesOnly`), names each TypeScript file of the package outside it
// (installed packages aside), and exits 1 when there is one. The package's
// `typecheck` runs it after tsc, so the gate holds it.
//
//   bun src/typecheck-coverage.ts

import { fileURLToPath } from 'node:url';

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, FileSystem, Path, Runtime, Schema, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import { listedFiles, uncovered } from './typecheck-coverage/coverage.js';

/** tsc could not list the program: its exit code and what it printed. */
class ListFailed extends Schema.TaggedError<ListFailed>()('ListFailed', {
  code: Schema.Finite,
  output: Schema.String,
}) {
  override get message() {
    return `typecheck-coverage: tsc --listFilesOnly exited ${this.code}: ${this.output.trim()}`;
  }
  override readonly [Runtime.errorReported] = false;
}

/** Files the program leaves out. */
class Uncovered extends Schema.TaggedError<Uncovered>()('Uncovered', {
  files: Schema.Array(Schema.String),
}) {
  override get message() {
    return [
      `typecheck-coverage: ${this.files.length} TypeScript file(s) under packages/scripts are outside its tsconfig's program, so no typecheck reads them:`,
      ...this.files.map((file) => `  ${file}`),
    ].join('\n');
  }
  override readonly [Runtime.errorReported] = false;
}

const text = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Stream.mkString(Stream.decodeText(stream));

/** The part of TypeScript's package.json that names its compiler's script. */
const TypeScriptPackage = Schema.fromJsonString(
  Schema.Struct({ bin: Schema.Struct({ tsc: Schema.String }) }),
);

/** The repo's tsc, the one the package's `typecheck` runs: its script's path. */
const tscScript = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const manifest = fileURLToPath(import.meta.resolve('typescript/package.json'));
  const { bin } = yield* Schema.decodeEffect(TypeScriptPackage)(yield* fs.readFileString(manifest));
  return path.join(path.dirname(manifest), bin.tsc);
});

/** The program's files, each an absolute path as tsc prints it. */
const programOf = (tsconfig: string) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner;
    const tsc = yield* tscScript;
    const child = yield* spawner.spawn(
      ChildProcess.make(process.execPath, [tsc, '--listFilesOnly', '-p', tsconfig], {
        forceKillAfter: '5 seconds',
      }),
    );
    const [stdout, stderr, code] = yield* Effect.all(
      [text(child.stdout), text(child.stderr), child.exitCode],
      { concurrency: 3 },
    );
    if (Number(code) !== 0) {
      return yield* ListFailed.make({ code: Number(code), output: `${stdout}${stderr}` });
    }
    return listedFiles(stdout);
  }).pipe(Effect.scoped);

const check = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.realPath(path.resolve(import.meta.dir, '..'));
  const relative = (file: string) => path.relative(root, file).split(path.sep).join('/');
  const [files, program] = yield* Effect.all(
    [fs.readDirectory(root, { recursive: true }), programOf(path.join(root, 'tsconfig.json'))],
    { concurrency: 2 },
  );
  const missing = uncovered(
    files.map((file) => file.split(path.sep).join('/')),
    program.map(relative),
  );
  if (missing.length > 0) return yield* Uncovered.make({ files: missing });
  yield* Console.log(
    `typecheck-coverage: every TypeScript file under packages/scripts is in its tsconfig's program`,
  );
}).pipe(
  Effect.tapError((error) => {
    if (error._tag !== 'ListFailed' && error._tag !== 'Uncovered') return Effect.void;
    return Console.error(error.message);
  }),
);

check.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
