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

// `--review` over a repository whose ledger cites one of a review's three
// findings: the cited one is routed, the one classed `none` is declined, the
// third is unrouted, and the run fails on it alone.
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
      '### F3 Medium: a check reads the wrong file',
      'Guard class: code',
      'Cheapest guard: a test',
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
    'routes each finding to the ledger entry citing it, declines one classed none, and fails on one no entry cites',
    () =>
      Effect.runPromise(
        Effect.map(runReview, ({ lines, code }) => {
          expect(lines).toEqual([
            'merge-audit review p6-x/review-1.md F1 routed routed-one',
            'merge-audit review p6-x/review-1.md F2 declined',
            'merge-audit review p6-x/review-1.md F3 unrouted',
            'merge-audit review 3 finding(s), 1 ledger entries: 1 problem(s)',
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
