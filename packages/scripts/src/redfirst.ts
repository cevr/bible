#!/usr/bin/env bun
// Red first, by machine: runs the test files a branch added or changed
// against the base's product sources, and names every new or changed case
// that passes there, a test the defect it was written for cannot fail.
//
//   bun run redfirst <base>     # HEAD's tests on <base>'s sources
//
// In a scratch worktree of <base> (dependencies installed from its lock), it
// runs the base's own version of each changed test file, to learn the cases
// the base had, then HEAD's version with HEAD's test code beside it (each
// `*.test.ts(x)`, `fixtures/`, `testing.ts` the branch changed). A HEAD case
// the base did not have, or whose lines the diff touched, is new or changed;
// each one that passed is printed as `redfirst green on base: <file>:<line>
// <name>`, and a count line ends the report. Browser-tier files
// (`*.dom.test.ts`, `*.pixel.test.ts`) are named, not run. Slow (an install
// and two runs), so never a hook: its output rides in a unit's review
// request. Exits non-zero only when git, the install or a run cannot start.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, FileSystem, Path } from 'effect';
import { Argument, Command } from 'effect/cli';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import {
  addedLines,
  caseKey,
  caseSpans,
  casesOf,
  newOrChanged,
  reportLines,
  unloaded,
} from './redfirst/report.js';

/** A command's stdout, whatever its exit code (a test run exits 1 on a red case). */
const run = (command: string, args: ReadonlyArray<string>, cwd: string) =>
  Effect.flatMap(ChildProcessSpawner, (spawner) =>
    spawner.string(ChildProcess.make(command, args, { cwd })),
  );

const lines = (out: string) => out.split('\n').filter((line) => line !== '');

const isTest = (file: string) => /\.test\.tsx?$/.test(file);
const isBrowserTier = (file: string) => /\.(dom|pixel)\.test\.ts$/.test(file);
/** Test code a test file may lean on: its fixtures and its package's doubles. */
const isTestCode = (file: string) =>
  isTest(file) || file.includes('/fixtures/') || file.endsWith('/testing.ts');

/** A scratch worktree of `base`, removed with the scope. */
const worktree = (root: string, base: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = path.join(yield* fs.makeTempDirectoryScoped({ prefix: 'redfirst-' }), 'base');
    yield* Effect.acquireRelease(run('git', ['worktree', 'add', '--detach', dir, base], root), () =>
      Effect.ignore(run('git', ['worktree', 'remove', '--force', dir], root)),
    );
    return dir;
  });

/**
 * The package a file's tests run in, as the prefix its repo paths start with:
 * the nearest folder above it with a package.json (`packages/film/`), or ''
 * for the repo's root.
 */
const packageOf = Effect.fn('redfirst.packageOf')(function* (root: string, file: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  let dir = path.dirname(file);
  while (dir !== '.' && dir !== '') {
    if (yield* fs.exists(path.join(root, dir, 'package.json'))) return `${dir}/`;
    dir = path.dirname(dir);
  }
  return '';
});

/** The cases of `files` (repo paths in the package `prefix` names) run in `tree`. */
const casesIn = Effect.fn('redfirst.casesIn')(function* (
  tree: string,
  prefix: string,
  files: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const report = path.join(yield* fs.makeTempDirectoryScoped({ prefix: 'redfirst-' }), 'junit.xml');
  const relative = files.map((file) => file.slice(prefix.length));
  yield* run(
    'bun',
    ['test', '--timeout', '30000', '--reporter=junit', `--reporter-outfile=${report}`, ...relative],
    path.join(tree, prefix),
  );
  const junit = yield* fs.readFileString(report).pipe(Effect.orElseSucceed(() => ''));
  return casesOf(junit, prefix);
});

/** Every case of `files` run in `tree`, package by package. */
const casesOfFiles = Effect.fn('redfirst.casesOfFiles')(function* (
  root: string,
  tree: string,
  files: ReadonlyArray<string>,
) {
  const byPackage = new Map<string, Array<string>>();
  for (const file of files) {
    const prefix = yield* packageOf(root, file);
    byPackage.set(prefix, [...(byPackage.get(prefix) ?? []), file]);
  }
  const runs = yield* Effect.forEach([...byPackage], ([prefix, inPackage]) =>
    casesIn(tree, prefix, inPackage),
  );
  return runs.flat();
});

const redfirst = Effect.fn('redfirst')(function* (baseRef: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = (yield* run('git', ['rev-parse', '--show-toplevel'], '.')).trim();
  const base = (yield* run('git', ['rev-parse', '--verify', `${baseRef}^{commit}`], root)).trim();
  const head = (yield* run('git', ['rev-parse', 'HEAD'], root)).trim();
  const changed = lines(
    yield* run('git', ['diff', '--name-only', '--diff-filter=AM', base, head], root),
  );
  const tests = changed.filter((file) => isTest(file) && !isBrowserTier(file));
  const skipped = changed.filter(isBrowserTier);
  const range = `${base.slice(0, 9)}..${head.slice(0, 9)}`;
  if (tests.length === 0) {
    yield* Effect.forEach(reportLines(range, [], { skipped, unloaded: [] }), (line) =>
      Console.log(line),
    );
    return;
  }
  const tree = yield* worktree(root, base);
  yield* run('bun', ['install', '--frozen-lockfile', '--ignore-scripts'], tree);
  // The base's own cases, from its own version of each file it had.
  const existed = lines(
    yield* run('git', ['ls-tree', '-r', '--name-only', base, '--', ...tests], root),
  );
  const baseCases = yield* casesOfFiles(root, tree, existed);
  // HEAD's test code over the base's sources.
  yield* Effect.forEach(
    changed.filter(isTestCode),
    (file) =>
      Effect.flatMap(run('git', ['show', `${head}:${file}`], root), (text) =>
        Effect.andThen(
          fs.makeDirectory(path.dirname(path.join(tree, file)), { recursive: true }),
          () => fs.writeFileString(path.join(tree, file), text),
        ),
      ),
    { discard: true },
  );
  const headCases = yield* casesOfFiles(root, tree, tests);
  const changes = new Map(
    yield* Effect.forEach(tests, (file) =>
      Effect.all([
        run('git', ['diff', '-U0', base, head, '--', file], root),
        run('git', ['show', `${head}:${file}`], root),
      ]).pipe(
        Effect.map(
          ([diff, text]) =>
            [file, { added: addedLines(diff), spans: caseSpans(file, text) }] as const,
        ),
      ),
    ),
  );
  const cases = newOrChanged(headCases, new Set(baseCases.map(caseKey)), changes);
  const report = reportLines(range, cases, { skipped, unloaded: unloaded(tests, headCases) });
  yield* Effect.forEach(report, (line) => Console.log(line));
});

const command = Command.make('redfirst', { base: Argument.String('base') }, ({ base }) =>
  Effect.scoped(redfirst(base)),
).pipe(
  Command.withDescription(
    "Name every new or changed test case that passes against the base's product sources",
  ),
);

Command.run(command, { version: '1.0.0' }).pipe(
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
