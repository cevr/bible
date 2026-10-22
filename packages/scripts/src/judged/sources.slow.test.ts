import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Path, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import type { Selector } from './items.js';
import type { JudgedRule } from './rule.js';
import { repoItems } from './sources.js';
import { historyComment } from './testing.js';
import { TEST_GIT } from '../testing.js';

/** A rule of each of `selectors`, named by it. */
const rulesOf = (selectors: ReadonlyArray<Selector>): ReadonlyArray<JudgedRule> =>
  selectors.map((selector) => ({ ...historyComment, id: selector, selector }));

/** The memo of the repo at `dir`, where the repo's config keeps it. */
const memoOf = (dir: string) => `${dir}/tmp/judged/items.json`;

/**
 * The items of `selectors` in the repo at `dir`, past `ignorePatterns`,
 * each with its rule's selector and its text as the run reads it, and the
 * tree they came from.
 */
const treeOf = (
  dir: string,
  ignorePatterns: ReadonlyArray<string>,
  selectors: ReadonlyArray<Selector>,
  rules = rulesOf(selectors),
) =>
  Effect.gen(function* () {
    const tree = yield* repoItems(dir, ignorePatterns, rules, {
      model: 'fake/model',
      file: memoOf(dir),
    });
    const texts = yield* tree.textsOf(tree.items);
    return {
      tree,
      items: tree.items.map((item, at) => ({
        selector: item.rule.selector,
        file: item.file,
        line: item.line,
        text: texts[at],
      })),
    };
  });

/** The comment blocks of the repo at `dir`, past the dist folders. */
const commentsOf = (dir: string) =>
  Effect.map(treeOf(dir, ['**/dist/**'], ['comments']), ({ items }) =>
    items.map(({ file, line, text }) => ({ file, line, text })),
  );

/** Runs `git <args>` in `cwd`; answers what it prints. */
const git = (cwd: string, ...args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const handle = yield* spawner.spawn(
          ChildProcess.make('git', [...TEST_GIT, ...args], { cwd, forceKillAfter: '5 seconds' }),
        );
        const out = yield* Stream.decodeText(handle.stdout).pipe(Stream.mkString);
        yield* handle.exitCode;
        return out.trim();
      }),
    );
  });

/**
 * A repository whose `main` commits `committed` (each file's lines), then
 * `tree` written over the working tree uncommitted; answers its directory.
 */
const repo = (
  committed: Record<string, ReadonlyArray<string>>,
  tree: Record<string, ReadonlyArray<string>>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'judged-comments-' });
    const write = (files: Record<string, ReadonlyArray<string>>) =>
      Effect.forEach(Object.entries(files), ([file, lines]) =>
        Effect.gen(function* () {
          yield* fs.makeDirectory(path.dirname(path.join(dir, file)), { recursive: true });
          yield* fs.writeFileString(path.join(dir, file), `${lines.join('\n')}\n`);
        }),
      );
    yield* git(dir, 'init', '-q', '-b', 'main');
    yield* write({
      '.oxlintrc.json': ['{', '  // the lint', '  "ignorePatterns": ["**/dist/**"]', '}'],
      'package.json': ['{ "workspaces": ["src"] }'],
      ...committed,
    });
    yield* git(dir, 'add', '-A');
    yield* git(dir, 'commit', '-qm', 'base');
    yield* write(tree);
    return dir;
  });

const withFs = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.scoped, Effect.provide(BunServices.layer));

const A = [
  '// One run of line comments,', // 1
  '// read as one block.', // 2
  'const a = 1;', // 3
  '', // 4
  '/**', // 5
  ' * A JSDoc block,', // 6
  ' * its stars gone.', // 7
  ' */', // 8
  'const b = 2;', // 9
  '', // 10
  '// Untouched.', // 11
  'const c = 3;', // 12
];

describe("the repo's items", () => {
  it.live('takes every comment block of a file whole, with its first line, changed or not', () =>
    withFs(
      Effect.gen(function* () {
        const changed = A.map((line, i) => {
          if (i === 1) return '// read as one block, now changed.';
          if (i === 11) return 'const c = 4; // a trailing comment of its own';
          return line;
        });
        const dir = yield* repo({ 'src/a.ts': A }, { 'src/a.ts': changed });
        expect(yield* commentsOf(dir)).toEqual([
          {
            file: 'src/a.ts',
            line: 1,
            text: 'One run of line comments,\nread as one block, now changed.',
          },
          { file: 'src/a.ts', line: 5, text: 'A JSDoc block,\nits stars gone.' },
          { file: 'src/a.ts', line: 11, text: 'Untouched.' },
          { file: 'src/a.ts', line: 12, text: 'a trailing comment of its own' },
        ]);
      }),
    ),
  );

  it.live('ends a run at a blank line or a block comment, and takes no comment of no words', () =>
    withFs(
      Effect.gen(function* () {
        const b = [
          '// A second run,',
          '',
          '// and a third after a blank line.',
          '/* plain */',
          '//',
        ];
        const dir = yield* repo({ 'src/b.ts': b }, {});
        expect(yield* commentsOf(dir)).toEqual([
          { file: 'src/b.ts', line: 1, text: 'A second run,' },
          { file: 'src/b.ts', line: 3, text: 'and a third after a blank line.' },
          { file: 'src/b.ts', line: 4, text: 'plain' },
        ]);
      }),
    ),
  );

  it.live(
    "reads the TypeScript the repo lints, committed or new in a workspace: past the lint's ignore patterns and git's, no declarations, no deleted file, no new folder outside every workspace",
    () =>
      withFs(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const comment = ['// a comment'];
          const dir = yield* repo(
            {
              'src/gone.ts': comment,
              'src/removed.ts': comment,
              'dist/c.ts': comment,
              'src/types.d.ts': comment,
              'src/d.js': comment,
              'README.md': comment,
              'src/e.mts': comment,
              '.gitignore': ['out/'],
            },
            {
              'src/untracked.ts': comment,
              'src/staged.ts': comment,
              'out/ignored.ts': comment,
              'prototypes/sketch.ts': comment,
            },
          );
          yield* git(dir, 'rm', '-q', 'src/gone.ts');
          yield* fs.remove(path.join(dir, 'src/removed.ts'));
          yield* git(dir, 'add', 'src/staged.ts');
          expect((yield* commentsOf(dir)).map((item) => item.file).toSorted()).toEqual([
            'src/e.mts',
            'src/staged.ts',
            'src/untracked.ts',
          ]);
        }),
      ),
  );

  it.live('reads a file whose name has a space, a letter past ASCII, or a quote', () =>
    withFs(
      Effect.gen(function* () {
        const comment = ['// a comment'];
        const dir = yield* repo(
          { 'src/a b.ts': comment, 'src/café.ts': comment },
          { 'src/say "hi".ts': comment },
        );
        expect((yield* commentsOf(dir)).map((item) => item.file).toSorted()).toEqual([
          'src/a b.ts',
          'src/café.ts',
          'src/say "hi".ts',
        ]);
      }),
    ),
  );

  it.live('fails, tagged, when git fails', () =>
    withFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'judged-no-repo-' });
        const failed = yield* Effect.flip(commentsOf(dir));
        expect(failed._tag).toBe('GitFailed');
      }),
    ),
  );

  it.live(
    "reads a series script's Markdown for scriptBeats alone, and every selector over one parse",
    () =>
      withFs(
        Effect.gen(function* () {
          const script = [
            '| #   | Say             | Picture       | Source note |',
            '| --- | --------------- | ------------- | ----------- |',
            '| 1   | In the beginning | A dark page   | Gen 1:1     |',
          ];
          const dir = yield* repo(
            {
              'apps/animations/series/health/scripts/01-a.md': script,
              'notes/plan.md': script,
              'src/a.ts': ['// One.', 'const a = 1;'],
            },
            {},
          );
          const { items } = yield* treeOf(dir, [], ['comments', 'commentedCode', 'scriptBeats']);
          expect(
            items.map(({ selector, file, line, text }) => [selector, file, line, text]),
          ).toEqual([
            [
              'scriptBeats',
              'apps/animations/series/health/scripts/01-a.md',
              3,
              'say: In the beginning',
            ],
            [
              'scriptBeats',
              'apps/animations/series/health/scripts/01-a.md',
              3,
              'picture: A dark page',
            ],
            ['comments', 'src/a.ts', 1, 'One.'],
            ['commentedCode', 'src/a.ts', 1, 'Comment:\nOne.\n\nCode it sits on:\nconst a = 1;'],
          ]);
        }),
      ),
  );

  it.live(
    "reads a file the memo holds by its hash from the memo, and its asked items' texts from the file",
    () =>
      withFs(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const dir = yield* repo({ 'src/a.ts': ['// One.', 'const a = 1;'] }, {});
          const first = yield* treeOf(dir, [], ['comments']);
          expect(first.items).toEqual([
            { selector: 'comments', file: 'src/a.ts', line: 1, text: 'One.' },
          ]);
          // The memo says the item stands on line 7: a read that parsed the
          // file again would say line 1.
          const memo = yield* fs.readFileString(memoOf(dir));
          yield* fs.writeFileString(memoOf(dir), memo.replace('"line":1', '"line":7'));
          const again = yield* treeOf(dir, [], ['comments']);
          expect(again.items).toEqual([
            { selector: 'comments', file: 'src/a.ts', line: 7, text: 'One.' },
          ]);
          expect(again.tree.items.map((item) => item.key)).toEqual(
            first.tree.items.map((item) => item.key),
          );
        }),
      ),
  );

  it.live(
    'reads again a file whose text changed, drops a file gone, and reads a memo of other rules as none',
    () =>
      withFs(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* repo(
            { 'src/a.ts': ['// One.', 'const a = 1;'], 'src/b.ts': ['// Two.'] },
            {},
          );
          yield* treeOf(dir, [], ['comments']);
          yield* fs.writeFileString(path.join(dir, 'src/a.ts'), '// One, changed.\n');
          yield* git(dir, 'rm', '-q', 'src/b.ts');
          const changed = yield* treeOf(dir, [], ['comments']);
          expect(changed.items).toEqual([
            { selector: 'comments', file: 'src/a.ts', line: 1, text: 'One, changed.' },
          ]);
          const memo = yield* fs.readFileString(memoOf(dir));
          expect([memo.includes('"src/a.ts"'), memo.includes('"src/b.ts"')]).toEqual([true, false]);
          // The memo's line, past what the file says, is read only in the form it was made.
          yield* fs.writeFileString(memoOf(dir), memo.replace('"line":1', '"line":7'));
          const reworded = rulesOf(['comments']).map((rule) => ({
            ...rule,
            instructions: 'Other words.',
          }));
          const other = yield* treeOf(dir, [], ['comments'], reworded);
          expect(other.items.map((item) => item.line)).toEqual([1]);
        }),
      ),
  );

  it.live("fails, tagged, to read an asked item's text from a file changed during the run", () =>
    withFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* repo({ 'src/a.ts': ['// One.'] }, {});
        yield* treeOf(dir, [], ['comments']);
        const tree = yield* repoItems(dir, [], rulesOf(['comments']), {
          model: 'fake/model',
          file: memoOf(dir),
        });
        yield* fs.writeFileString(path.join(dir, 'src/a.ts'), '// Another.\n');
        const failed = yield* Effect.flip(tree.textsOf(tree.items));
        expect(failed._tag).toBe('ItemsMoved');
      }),
    ),
  );
});
