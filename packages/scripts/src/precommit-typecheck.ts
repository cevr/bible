#!/usr/bin/env bun
// The pre-commit typecheck (`lefthook.yml`): `turbo run typecheck` over the
// workspaces the staged files ask for (`precommit-typecheck/workspaces.ts`),
// and nothing when they ask for none. turbo's `typecheck` cache replays a
// workspace whose inputs did not change, its dependencies' typechecks
// included. Only the touched workspaces, as the owner chose (ask
// abe573de390): a break in a workspace that depends on one is the slow
// suite's to find. The typecheck reads the working tree, so a file changed
// and left unstaged is checked as it stands, not as it is staged. Prints the
// workspaces and its time; exits with turbo's code.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Clock, Console, Effect, FileSystem, Option, Path, Schema } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import { type Workspace, typecheckedBy } from './precommit-typecheck/workspaces.js';

const Manifest = Schema.fromJsonString(
  Schema.Struct({
    name: Schema.String,
    scripts: Schema.Record(Schema.String, Schema.String).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed({})),
    ),
  }),
);

/** The workspaces (`apps/*`, `packages/*`) that have a `typecheck` script. */
const workspacesOf = (root: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const groups = yield* Effect.forEach(['apps', 'packages'], (group) =>
      Effect.flatMap(fs.readDirectory(path.join(root, group)), (names) =>
        Effect.forEach(
          names,
          (name) =>
            fs.readFileString(path.join(root, group, name, 'package.json')).pipe(
              Effect.flatMap(Schema.decodeEffect(Manifest)),
              Effect.option,
              Effect.map((manifest): ReadonlyArray<Workspace> =>
                Option.toArray(manifest)
                  .filter(({ scripts }) => 'typecheck' in scripts)
                  .map((each) => ({ dir: `${group}/${name}`, name: each.name })),
              ),
            ),
          { concurrency: 8 },
        ),
      ),
    );
    return groups.flat(2);
  });

Effect.gen(function* () {
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner;
  const started = yield* Clock.currentTimeMillis;
  // packages/scripts/src → the repo root.
  const root = path.resolve(import.meta.dir, '..', '..', '..');
  const staged = (yield* spawner.string(
    ChildProcess.make('git', ['diff', '--cached', '--name-only'], {
      cwd: root,
      forceKillAfter: '5 seconds',
    }),
  ))
    .split('\n')
    .filter((line) => line.length > 0);
  const names = typecheckedBy(staged, yield* workspacesOf(root));
  if (names.length === 0) return;
  const code = yield* Effect.scoped(
    Effect.flatMap(
      spawner.spawn(
        ChildProcess.make(
          'node_modules/.bin/turbo',
          [
            'run',
            'typecheck',
            ...names.map((name) => `--filter=${name}`),
            '--output-logs=errors-only',
            '--ui=stream',
          ],
          {
            cwd: root,
            stdin: 'inherit',
            stdout: 'inherit',
            stderr: 'inherit',
            forceKillAfter: '5 seconds',
          },
        ),
      ),
      (child) => child.exitCode,
    ),
  );
  const ended = yield* Clock.currentTimeMillis;
  yield* Console.log(`typecheck: ${names.join(', ')}, exit ${Number(code)}, ${ended - started} ms`);
  yield* Effect.sync(() => {
    process.exitCode = Number(code);
  });
}).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
