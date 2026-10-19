import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Path, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { changedItems } from './changes.js';

/** The changed comment blocks of the repo at `dir` against `base`, past the dist folders. */
const changedComments = (dir: string, base: string) =>
  Effect.map(changedItems(dir, base, ['**/dist/**'], ['comments']), (items) =>
    items.map(({ file, line, text }) => ({ file, line, text })),
  );

/** Runs `git <args>` in `cwd`; answers what it prints. */
const git = (cwd: string, ...args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const handle = yield* spawner.spawn(
          ChildProcess.make(
            'git',
            ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
            { cwd, forceKillAfter: '5 seconds' },
          ),
        );
        const out = yield* Stream.decodeText(handle.stdout).pipe(Stream.mkString);
        yield* handle.exitCode;
        return out.trim();
      }),
    );
  });

/**
 * A repository whose `main` holds `base` (each file's lines), then a branch
 * `topic` committing `branch`, then `tree` written over the working tree
 * uncommitted; answers its directory.
 */
const repo = (
  base: Record<string, ReadonlyArray<string>>,
  branch: Record<string, ReadonlyArray<string>>,
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
      ...base,
    });
    yield* git(dir, 'add', '-A');
    yield* git(dir, 'commit', '-qm', 'base');
    yield* git(dir, 'checkout', '-q', '-b', 'topic');
    yield* write(branch);
    yield* git(dir, 'add', '-A');
    yield* git(dir, 'commit', '-qm', 'branch');
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

describe('the changed items', () => {
  it.live('takes each block a changed line touches whole, with its first line', () =>
    withFs(
      Effect.gen(function* () {
        const changed = A.map((line, i) => {
          if (i === 1) return '// read as one block, now changed.';
          if (i === 6) return ' * its stars gone, and changed.';
          if (i === 11) return 'const c = 4; // a trailing comment of its own';
          return line;
        });
        const dir = yield* repo({ 'src/a.ts': A }, {}, { 'src/a.ts': changed });
        expect(yield* changedComments(dir, 'main')).toEqual([
          {
            file: 'src/a.ts',
            line: 1,
            text: 'One run of line comments,\nread as one block, now changed.',
          },
          { file: 'src/a.ts', line: 5, text: 'A JSDoc block,\nits stars gone, and changed.' },
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
        const dir = yield* repo({}, { 'src/b.ts': b }, {});
        expect(yield* changedComments(dir, 'main')).toEqual([
          { file: 'src/b.ts', line: 1, text: 'A second run,' },
          { file: 'src/b.ts', line: 3, text: 'and a third after a blank line.' },
          { file: 'src/b.ts', line: 4, text: 'plain' },
        ]);
      }),
    ),
  );

  it.live(
    "reads only the TypeScript the repo lints and tracks: past the lint's ignore patterns, no declarations, no new untracked file",
    () =>
      withFs(
        Effect.gen(function* () {
          const comment = ['// a comment'];
          const dir = yield* repo(
            { 'src/gone.ts': comment, 'src/kept.tsx': ['const k = 1;'] },
            {
              'dist/c.ts': comment,
              'src/types.d.ts': comment,
              'src/d.js': comment,
              'README.md': comment,
              'src/e.mts': comment,
            },
            { 'src/untracked.ts': comment, 'src/kept.tsx': ['const k = 1; // in a tsx'] },
          );
          yield* git(dir, 'rm', '-q', 'src/gone.ts');
          expect(yield* changedComments(dir, 'main')).toEqual([
            { file: 'src/e.mts', line: 1, text: 'a comment' },
            { file: 'src/kept.tsx', line: 1, text: 'in a tsx' },
          ]);
        }),
      ),
  );

  it.live('reads a file whose name has a space, a letter past ASCII, or a quote', () =>
    withFs(
      Effect.gen(function* () {
        const comment = ['// a comment'];
        const dir = yield* repo(
          {},
          { 'src/a b.ts': comment, 'src/café.ts': comment, 'src/say "hi".ts': comment },
          {},
        );
        expect((yield* changedComments(dir, 'main')).map((item) => item.file).sort()).toEqual([
          'src/a b.ts',
          'src/café.ts',
          'src/say "hi".ts',
        ]);
      }),
    ),
  );

  it.live("reads the diff whatever the repo's git config says of its prefixes", () =>
    withFs(
      Effect.gen(function* () {
        for (const setting of ['diff.noprefix', 'diff.mnemonicPrefix']) {
          const dir = yield* repo({}, { 'src/a.ts': ['// a comment'] }, {});
          yield* git(dir, 'config', setting, 'true');
          expect(yield* changedComments(dir, 'main')).toEqual([
            { file: 'src/a.ts', line: 1, text: 'a comment' },
          ]);
        }
      }),
    ),
  );

  it.live('takes no unchanged comment between two changes under diff.interHunkContext', () =>
    withFs(
      Effect.gen(function* () {
        const base = ['const a = 1;', '', '// untouched middle', '', '', 'const b = 2;'];
        const dir = yield* repo(
          { 'src/a.ts': base },
          {
            'src/a.ts': base.map((line, i) => {
              if (i === 0) return 'const a = 1; // first';
              if (i === 5) return 'const b = 2; // last';
              return line;
            }),
          },
          {},
        );
        yield* git(dir, 'config', 'diff.interHunkContext', '10');
        expect((yield* changedComments(dir, 'main')).map((item) => item.text)).toEqual([
          'first',
          'last',
        ]);
      }),
    ),
  );

  it.live("reads the source's own lines past a textconv driver or a -diff attribute", () =>
    withFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const base = ['// keep', 'const a = 1;'];
        const branch = ['// keep', 'const a = 1;', '// new words'];
        // A driver that drops every comment row from what git compares.
        const textconv = yield* repo({ 'src/a.ts': base }, { 'src/a.ts': branch }, {});
        yield* git(textconv, 'config', 'diff.nocomments.textconv', "sed '/^\\/\\//d'");
        yield* fs.writeFileString(
          path.join(textconv, '.git', 'info', 'attributes'),
          '*.ts diff=nocomments\n',
        );
        // An attribute that makes git call the file binary.
        const binary = yield* repo(
          { 'src/a.ts': base },
          { 'src/a.ts': branch, '.gitattributes': ['*.ts -diff'] },
          {},
        );
        for (const dir of [textconv, binary])
          expect(yield* changedComments(dir, 'main')).toEqual([
            { file: 'src/a.ts', line: 3, text: 'new words' },
          ]);
      }),
    ),
  );

  it.live('reads an added line that starts with ++ as code, not a file header', () =>
    withFs(
      Effect.gen(function* () {
        // Two hunks: the added `++ b/x.ts` (git's row `+++ b/x.ts`, a
        // header's shape), then a changed comment.
        const head = ['let b = 0;', 'const x = { ts: 1 };'];
        const tail = ['const a = 1;'];
        const dir = yield* repo(
          { 'src/a.ts': [...head, ...tail, '// old words', 'const y = 1;'] },
          { 'src/a.ts': [...head, '++ b/x.ts', ...tail, '// new words', 'const y = 1;'] },
          {},
        );
        expect(yield* changedComments(dir, 'main')).toEqual([
          { file: 'src/a.ts', line: 5, text: 'new words' },
        ]);
      }),
    ),
  );

  it.live('fails, tagged, when git fails', () =>
    withFs(
      Effect.gen(function* () {
        const dir = yield* repo({ 'src/a.ts': A }, {}, {});
        const noBase = yield* Effect.flip(changedComments(dir, 'no-such-ref'));
        expect(noBase._tag).toBe('GitFailed');
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
            {},
            {
              'apps/animations/series/health/scripts/01-a.md': script,
              'notes/plan.md': script,
              'src/a.ts': ['// One.', 'const a = 1;'],
            },
            {},
          );
          const items = yield* changedItems(
            dir,
            'main',
            [],
            ['comments', 'commentedCode', 'scriptBeats'],
          );
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
});
