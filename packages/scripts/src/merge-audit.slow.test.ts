// `bun run merge-audit` over a real repository: a branch merges main inside
// itself and resolves the conflict by keeping its own file whole, then main
// merges the branch with no conflict left. The outer merge has nothing to
// say; the edit main lost lives in the branch's own merge, which the audit
// reads too: an outer merge with `conflicted=0` can sit over an inner merge
// that dropped lines.

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, test } from 'bun:test';
import { Effect, FileSystem, Path, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import { TEST_GIT as GIT } from './testing.js';

const fixture = (dir: string) => {
  /** A command's stdout in the fixture, whatever its exit code (the merge of main conflicts). */
  const sh = (command: string, args: ReadonlyArray<string>) =>
    Effect.flatMap(ChildProcessSpawner, (spawner) =>
      spawner.string(ChildProcess.make(command, args, { cwd: dir, forceKillAfter: '5 seconds' })),
    ).pipe(Effect.map((out) => out.trim()));
  const git = (...args: ReadonlyArray<string>) => sh('git', [...GIT, ...args]);
  const commitNotes = (lines: ReadonlyArray<string>, message: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.writeFileString(path.join(dir, 'notes.md'), `${lines.join('\n')}\n`);
      yield* git('add', 'notes.md');
      yield* git('commit', '-q', '-m', message);
    });
  return { sh, git, commitNotes };
};

const run = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'merge-audit-' });
  const { sh, git, commitNotes } = fixture(dir);
  yield* git('init', '-q', '-b', 'main');
  yield* commitNotes(['# Notes', 'the second line, as it began', 'the third line stays'], 'base');
  yield* git('checkout', '-q', '-b', 'batch');
  yield* commitNotes(
    ['# Notes', 'the second line, as the batch has it', 'the third line stays'],
    'batch edit',
  );
  yield* git('checkout', '-q', 'main');
  yield* commitNotes(
    ['# Notes', 'the second line, as main has it', 'the third line stays'],
    'main edit',
  );
  // The batch merges main and keeps its own file whole.
  yield* git('checkout', '-q', 'batch');
  yield* git('merge', '-q', 'main');
  yield* git('checkout', '--ours', 'notes.md');
  yield* git('add', 'notes.md');
  yield* git('commit', '-q', '--no-edit');
  const inner = (yield* git('rev-parse', 'HEAD')).slice(0, 8);
  yield* git('checkout', '-q', 'main');
  yield* git('merge', '-q', '--no-ff', '-m', 'merge batch', 'batch');
  const outer = (yield* git('rev-parse', 'HEAD')).slice(0, 8);
  const out = yield* sh('bun', [path.join(import.meta.dir, 'merge-audit.ts')]);
  return { inner, outer, lines: out.split('\n') };
}).pipe(Effect.scoped, Effect.provide(BunServices.layer));

// `--each`: a unit whose second commit is red on its own and whose third
// fixes it; the tip is green, so only a run per commit sees the second
// (deps r1 m1: the oxfmt bump commit red on `fmt:check` by itself).
const runEach = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'merge-audit-each-' });
  const { sh, git } = fixture(dir);
  const write = (file: string, text: string) => fs.writeFileString(path.join(dir, file), text);
  const commitAll = (message: string) =>
    Effect.andThen(git('add', '-A'), git('commit', '-q', '-m', message));
  yield* git('init', '-q', '-b', 'main');
  yield* write('package.json', '{ "scripts": { "guard": "test ! -f red" } }\n');
  yield* commitAll('base');
  const base = yield* git('rev-parse', 'HEAD');
  yield* write('a.txt', 'a\n');
  yield* commitAll('green');
  yield* write('red', 'red\n');
  yield* commitAll('red on its own');
  yield* fs.remove(path.join(dir, 'red'));
  yield* commitAll('the fix');
  const commits = (yield* git('rev-list', '--reverse', `${base}..HEAD`)).split('\n');
  const out = yield* sh('bun', [path.join(import.meta.dir, 'merge-audit.ts'), '--each', base]);
  return { commits, lines: out.split('\n').filter((line) => line.startsWith('merge-audit ')) };
}).pipe(Effect.scoped, Effect.provide(BunServices.layer));

// `--each` where a checkout fails: the guard leaves an untracked file that the
// next commit tracks, so git refuses to check that commit out over it.
const runEachCheckoutFails = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'merge-audit-each-' });
  const { git } = fixture(dir);
  const write = (file: string, text: string) => fs.writeFileString(path.join(dir, file), text);
  const commitAll = (message: string) =>
    Effect.andThen(git('add', '-A'), git('commit', '-q', '-m', message));
  yield* git('init', '-q', '-b', 'main');
  yield* write('package.json', '{ "scripts": { "guard": "echo left > left.txt" } }\n');
  yield* commitAll('base');
  const base = yield* git('rev-parse', 'HEAD');
  yield* write('a.txt', 'a\n');
  yield* commitAll('green');
  yield* write('left.txt', 'tracked\n');
  yield* commitAll('tracks the file the guard leaves');
  const blocked = yield* git('rev-parse', 'HEAD');
  const spawner = yield* ChildProcessSpawner;
  const child = yield* spawner.spawn(
    ChildProcess.make('bun', [path.join(import.meta.dir, 'merge-audit.ts'), '--each', base], {
      cwd: dir,
      forceKillAfter: '5 seconds',
    }),
  );
  const [out, code] = yield* Effect.all(
    [Stream.mkString(Stream.decodeText(child.all)), child.exitCode],
    { concurrency: 2 },
  );
  return { blocked, out, code: Number(code) };
}).pipe(Effect.scoped, Effect.provide(BunServices.layer));

// `--each` where git cannot list the commits: HEAD is a branch with no commit
// yet (`checkout --orphan`), so `rev-list <base>..HEAD` fails, though the base
// is a commit the worktree can be made at.
const runEachListFails = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'merge-audit-each-' });
  const { git } = fixture(dir);
  yield* git('init', '-q', '-b', 'main');
  yield* fs.writeFileString(path.join(dir, 'package.json'), '{ "scripts": { "guard": "true" } }\n');
  yield* git('add', '-A');
  yield* git('commit', '-q', '-m', 'base');
  const base = yield* git('rev-parse', 'HEAD');
  yield* git('checkout', '-q', '--orphan', 'unborn');
  const spawner = yield* ChildProcessSpawner;
  const child = yield* spawner.spawn(
    ChildProcess.make('bun', [path.join(import.meta.dir, 'merge-audit.ts'), '--each', base], {
      cwd: dir,
      forceKillAfter: '5 seconds',
    }),
  );
  const [out, code] = yield* Effect.all(
    [Stream.mkString(Stream.decodeText(child.all)), child.exitCode],
    { concurrency: 2 },
  );
  return { out, code: Number(code) };
}).pipe(Effect.scoped, Effect.provide(BunServices.layer));

describe('merge audit, each commit', () => {
  test(
    'names the commit red on its own though the tip is green',
    () =>
      Effect.runPromise(
        Effect.map(runEach, ({ commits, lines }) =>
          expect(lines.slice(0, 3)).toEqual(
            commits.map((commit, i) =>
              [`merge-audit ${commit.slice(0, 8)} guard`, ['ok', 'red', 'ok'][i]].join(' '),
            ),
          ),
        ),
      ),
    30_000,
  );

  test(
    'fails when a commit cannot be checked out, and never reports the tree before it as that commit',
    () =>
      Effect.runPromise(
        Effect.map(runEachCheckoutFails, ({ blocked, out, code }) => {
          expect(code).not.toBe(0);
          expect(out).not.toContain(`merge-audit ${blocked.slice(0, 8)} guard ok`);
          expect(out).toContain(blocked.slice(0, 8));
        }),
      ),
    30_000,
  );

  test(
    'fails when git cannot list the commits, and never reports an empty run as green',
    () =>
      Effect.runPromise(
        Effect.map(runEachListFails, ({ out, code }) => {
          expect(code).not.toBe(0);
          expect(out).not.toContain('guard ok');
          expect(out).toContain('git rev-list');
        }),
      ),
    30_000,
  );
});

// `--review` over a repository whose ledger cites one of a review's two
// findings: the cited one is routed, the other is not, and the run fails.
const runReview = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'merge-audit-review-' });
  const { git } = fixture(dir);
  yield* git('init', '-q', '-b', 'main');
  yield* fs.makeDirectory(path.join(dir, 'docs'));
  yield* fs.writeFileString(path.join(dir, '.oxlintrc.json'), '{ "rules": {} }\n');
  yield* fs.writeFileString(
    path.join(dir, 'docs', 'lessons.md'),
    [
      '# Lessons',
      '### routed-one',
      '- **Date:** 2026-10-19',
      '- **Kind:** review',
      '- **Said:** "the parts drop a file"',
      '- **Source:** p6-x/review-1.md F1',
      '- **Wrong:** a part dropped a file.',
      '- **Cause:** Not recorded.',
      '- **Guard:** none: the fix carries its own test',
      '',
    ].join('\n'),
  );
  yield* fs.makeDirectory(path.join(dir, 'p6-x'));
  const review = path.join(dir, 'p6-x', 'review-1.md');
  yield* fs.writeFileString(
    review,
    [
      '### F1 High: the parts drop a file',
      'Guard class: code',
      'Cheapest guard: a test',
      '### F2 Low: a name',
      'Guard class: none',
      'Cheapest guard: none',
      '',
    ].join('\n'),
  );
  const spawner = yield* ChildProcessSpawner;
  const child = yield* spawner.spawn(
    ChildProcess.make('bun', [path.join(import.meta.dir, 'merge-audit.ts'), '--review', review], {
      cwd: dir,
      forceKillAfter: '5 seconds',
    }),
  );
  const [out, code] = yield* Effect.all(
    [Stream.mkString(Stream.decodeText(child.stdout)), child.exitCode],
    { concurrency: 2 },
  );
  return { lines: out.trim().split('\n'), code: Number(code) };
}).pipe(Effect.scoped, Effect.provide(BunServices.layer));

describe('merge audit, review', () => {
  test(
    'routes each finding to the ledger entry citing it, and fails on one no entry cites',
    () =>
      Effect.runPromise(
        Effect.map(runReview, ({ lines, code }) => {
          expect(lines).toEqual([
            'merge-audit review p6-x/review-1.md F1 routed routed-one',
            'merge-audit review p6-x/review-1.md F2 unrouted',
            'merge-audit review 2 finding(s), 1 ledger entries: 1 problem(s)',
          ]);
          expect(code).not.toBe(0);
        }),
      ),
    30_000,
  );
});

describe('merge audit, run', () => {
  test(
    "names the edits a branch's own merge of main lost, under the merge of the branch",
    () =>
      Effect.runPromise(
        Effect.map(run, ({ inner, outer, lines }) =>
          expect(lines).toEqual([
            `merge-audit ${outer} conflicted=0 resolved-by-hand=0`,
            `merge-audit ${inner} inside ${outer} conflicted=1 resolved-by-hand=1`,
            'merge-audit notes.md dropped ^2: "the second line, as main has it"',
          ]),
        ),
      ),
    30_000,
  );
});
