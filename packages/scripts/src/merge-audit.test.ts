// `bun run merge-audit` over a real repository: a branch merges main inside
// itself and resolves the conflict by keeping its own file whole, then main
// merges the branch with no conflict left. The outer merge has nothing to
// say; the edit main lost lives in the branch's own merge, which the audit
// reads too (pass 7 and 8: 05aa2bec printed `conflicted=0` over an inner
// 59a8b2ca that had dropped lines).

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, test } from 'bun:test';
import { Effect, FileSystem, Path } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

/** Git in the fixture repository, kept from the machine's own config (hooks, signing). */
const GIT = [
  '-c',
  'user.name=probe',
  '-c',
  'user.email=probe@example.com',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'core.hooksPath=/nonexistent/film-probe-hooks',
  '-c',
  'core.editor=true',
];

const fixture = (dir: string) => {
  /** A command's stdout in the fixture, whatever its exit code (the merge of main conflicts). */
  const sh = (command: string, args: ReadonlyArray<string>) =>
    Effect.flatMap(ChildProcessSpawner, (spawner) =>
      spawner.string(ChildProcess.make(command, args, { cwd: dir })),
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
