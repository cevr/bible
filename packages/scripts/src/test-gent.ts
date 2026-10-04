#!/usr/bin/env bun
// `bun run test:gent`: the film extension's typecheck and tests (`.gent/` at
// the repo root), against a local gent checkout. Local only, like
// `test:perf`: gent is no dependency of this repo and CI has no checkout of
// it, so the gate never runs this.
//
// It links `.gent/node_modules` to the checkout's modules (one `effect` for
// the extension, its tests and gent), typechecks `.gent/` with the
// checkout's compiler, and runs `.gent/tests` under gent's test preload (a
// temp HOME, no network but this machine). The checkout is
// `~/Developer/personal/gent`, or `GENT_CHECKOUT`.
//
// The runner lives here, not in `.gent/`, because it is what makes that link:
// it resolves its own modules from this package, so it starts on a fresh
// checkout.

import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Config, Console, Effect, FileSystem, Option, Path } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

/** Run `command` in `cwd` with this process's terminal: its exit code. */
const step = Effect.fn('test-gent.step')(function* (
  cwd: string,
  command: string,
  args: ReadonlyArray<string>,
) {
  const spawner = yield* ChildProcessSpawner;
  const child = yield* spawner.spawn(
    ChildProcess.make(command, args, {
      cwd,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    }),
  );
  return yield* child.exitCode;
});

const run = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const home = yield* Config.String('HOME');
  const gent = yield* Config.String('GENT_CHECKOUT').pipe(
    Config.withDefault(path.join(home, 'Developer', 'personal', 'gent')),
  );
  // packages/scripts/src → the repo root, and its `.gent/` folder.
  const root = path.resolve(import.meta.dir, '..', '..', '..');
  const extension = path.join(root, '.gent');
  const modules = path.join(gent, 'node_modules');
  const ready = yield* fs.exists(path.join(modules, '@gent', 'core', 'package.json'));
  if (!ready) {
    yield* Console.error(
      `test:gent: no gent checkout with its modules installed at ${gent}.\n` +
        'The film extension (.gent/extensions/film.ts) is typechecked and tested against one:\n' +
        `clone gent there and run \`bun install\` in it, or name another checkout in GENT_CHECKOUT.\n` +
        'Nothing was run.',
    );
    return 1;
  }
  const link = path.join(extension, 'node_modules');
  const linked = yield* fs.readLink(link).pipe(Effect.option);
  if (Option.isNone(linked)) yield* fs.symlink(modules, link);
  if (Option.isSome(linked) && linked.value !== modules) {
    yield* Console.error(
      `test:gent: ${link} links to ${linked.value}, not ${modules}. Remove the link and run again.`,
    );
    return 1;
  }
  yield* Console.log(`test:gent: gent at ${gent}`);
  const typed = yield* step(root, path.join(modules, '.bin', 'tsc'), [
    '-p',
    path.join(extension, 'tsconfig.json'),
  ]);
  if (typed !== 0) return typed;
  return yield* step(root, process.execPath, [
    'test',
    '--preload',
    path.join(gent, 'packages', 'tooling', 'src', 'test-preload.ts'),
    '--timeout=30000',
    path.join(extension, 'tests'),
  ]);
}).pipe(
  Effect.flatMap((code) =>
    Effect.sync(() => {
      process.exitCode = code;
    }),
  ),
  Effect.scoped,
  Effect.provide(BunServices.layer),
);

BunRuntime.runMain(run);
