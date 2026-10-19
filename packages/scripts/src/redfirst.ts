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
// request. A renamed test file runs at its new path, its base cases read at
// its old one; a changed test file it does not run (a browser tier, a
// deleted file) is named with why. Exits non-zero when git or the install
// exits non-zero, or a test run writes no junit report: a report printed
// is one every step of which ran. Each run carries a probe case beside the
// package's files, so a run none of whose files loads on the base (a new
// test of a new module) still writes its report, and those files are named
// red whole.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, FileSystem, Option, Path, Runtime, Schema, Stream } from 'effect';
import { Argument, Command } from 'effect/cli';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import {
  caseKey,
  caseSpans,
  casesOf,
  changesOf,
  diffLines,
  isBrowserTier,
  isTest,
  newOrChanged,
  reportLines,
  skippedOf,
  unloaded,
} from './redfirst/report.js';

/** A step that did not do its work: the command, its exit code and what it printed. */
class StepFailed extends Schema.TaggedError<StepFailed>()('StepFailed', {
  command: Schema.String,
  code: Schema.Finite,
  output: Schema.String,
}) {
  override get message() {
    return `redfirst: \`${this.command}\` exited ${this.code}: ${this.output.trim()}`;
  }
  override readonly [Runtime.errorReported] = false;
}

const text = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Stream.mkString(Stream.decodeText(stream));

/** A command's stdout, its stderr and its exit code. */
const exec = (command: string, args: ReadonlyArray<string>, cwd: string) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner;
    const child = yield* spawner.spawn(
      ChildProcess.make(command, args, { cwd, forceKillAfter: '5 seconds' }),
    );
    const [stdout, stderr, code] = yield* Effect.all(
      [text(child.stdout), text(child.stderr), child.exitCode],
      { concurrency: 3 },
    );
    return { stdout, stderr, code: Number(code) };
  }).pipe(Effect.scoped);

const failed = (command: string, args: ReadonlyArray<string>, code: number, output: string) =>
  StepFailed.make({ command: [command, ...args].join(' '), code, output });

/** A command's stdout, or StepFailed when it exits non-zero. */
const run = (command: string, args: ReadonlyArray<string>, cwd: string) =>
  Effect.flatMap(exec(command, args, cwd), ({ stdout, stderr, code }) => {
    if (code === 0) return Effect.succeed(stdout);
    return Effect.fail(failed(command, args, code, `${stderr}${stdout}`));
  });

const lines = (out: string) => out.split('\n').filter((line) => line !== '');

/** Test code a test file may lean on: its fixtures and its package's doubles. */
const isTestCode = (file: string) =>
  isTest(file) || /(^|\/)fixtures\//.test(file) || file.endsWith('/testing.ts');

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

/**
 * The probe run beside each package's files: one case that always loads, for
 * Bun writes no report when no file of a run loads.
 */
const PROBE = {
  file: 'redfirst-probe.test.ts',
  text: "import { test } from 'bun:test';\n\ntest('probe', () => {});\n",
};

/** The cases of `files` (repo paths in the package `prefix` names) run in `tree`. */
const casesIn = Effect.fn('redfirst.casesIn')(function* (
  tree: string,
  prefix: string,
  files: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const scratch = yield* fs.makeTempDirectoryScoped({ prefix: 'redfirst-' });
  const report = path.join(scratch, 'junit.xml');
  const probe = path.join(scratch, PROBE.file);
  yield* fs.writeFileString(probe, PROBE.text);
  const relative = files.map((file) => file.slice(prefix.length));
  const args = [
    'test',
    '--timeout',
    '30000',
    '--reporter=junit',
    `--reporter-outfile=${report}`,
    ...relative,
    probe,
  ];
  const ran = yield* exec('bun', args, path.join(tree, prefix));
  // A run exits 1 on a red case, a file that does not load among them; with
  // the probe beside them, it ran only if it wrote its report.
  const junit = yield* Effect.option(fs.readFileString(report));
  if (ran.code > 1 || Option.isNone(junit))
    return yield* failed('bun', args, ran.code, `${ran.stderr}${ran.stdout}`.slice(-4000));
  return casesOf(junit.value, prefix).filter((c) => !c.file.endsWith(PROBE.file));
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
  const root = (yield* run('git', ['rev-parse', '--show-toplevel'], '.')).trim();
  const base = (yield* run('git', ['rev-parse', '--verify', `${baseRef}^{commit}`], root)).trim();
  const head = (yield* run('git', ['rev-parse', 'HEAD'], root)).trim();
  const statuses = changesOf(yield* run('git', ['diff', '--name-status', '-M', base, head], root));
  const kept = statuses.filter((c) => ['A', 'M', 'R'].includes(c.status));
  const changed = kept.map((c) => c.file);
  const tests = changed.filter((file) => isTest(file) && !isBrowserTier(file));
  /** A test file's path at the base: its old one when the branch renamed it. */
  const fromOf = new Map(kept.map((c) => [c.file, c.from]));
  const toOf = new Map(kept.map((c) => [c.from, c.file]));
  const skipped = skippedOf(statuses);
  const range = `${base.slice(0, 9)}..${head.slice(0, 9)}`;
  if (tests.length === 0) {
    yield* Effect.forEach(reportLines(range, [], { skipped, unloaded: [] }), (line) =>
      Console.log(line),
    );
    return;
  }
  const tree = yield* worktree(root, base);
  yield* run('bun', ['install', '--frozen-lockfile', '--ignore-scripts'], tree);
  // The base's own cases, from its own version of each file it had (a renamed
  // file's at its old path, keyed by its new one).
  const existed = lines(
    yield* run(
      'git',
      [
        'ls-tree',
        '-r',
        '--name-only',
        base,
        '--',
        ...tests.map((file) => fromOf.get(file) ?? file),
      ],
      root,
    ),
  );
  const baseCases = (yield* casesOfFiles(root, tree, existed)).map((c) => ({
    ...c,
    file: toOf.get(c.file) ?? c.file,
  }));
  // HEAD's test code over the base's sources, written by git from its own
  // objects so a binary fixture (a PNG) lands byte for byte: text through
  // stdout would decode it as UTF-8 and change it.
  const testCode = changed.filter(isTestCode);
  if (testCode.length > 0) yield* run('git', ['checkout', head, '--', ...testCode], tree);
  const headCases = yield* casesOfFiles(root, tree, tests);
  const changes = new Map(
    yield* Effect.forEach(tests, (file) =>
      Effect.all([
        run('git', ['diff', '-U0', '-M', base, head, '--', fromOf.get(file) ?? file, file], root),
        run('git', ['show', `${head}:${file}`], root),
      ]).pipe(
        Effect.map(
          ([diff, text]) => [file, { ...diffLines(diff), spans: caseSpans(file, text) }] as const,
        ),
      ),
    ),
  );
  const cases = newOrChanged(headCases, new Set(baseCases.map(caseKey)), changes);
  const report = reportLines(range, cases, { skipped, unloaded: unloaded(tests, headCases) });
  yield* Effect.forEach(report, (line) => Console.log(line));
});

const command = Command.make('redfirst', { base: Argument.String('base') }, ({ base }) =>
  Effect.scoped(redfirst(base)).pipe(
    Effect.tapErrorTag('StepFailed', (error) => Console.error(error.message)),
  ),
).pipe(
  Command.withDescription(
    "Name every new or changed test case that passes against the base's product sources",
  ),
);

Command.run(command, { version: '1.0.0' }).pipe(
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
