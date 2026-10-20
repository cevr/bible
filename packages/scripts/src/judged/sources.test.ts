import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Path, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { repoItems } from './sources.js';

/** The comment blocks of the repo at `dir`, past the dist folders. */
const commentsOf = (dir: string) =>
  Effect.map(repoItems(dir, ['**/dist/**'], ['comments']), (items) =>
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
          const items = yield* repoItems(dir, [], ['comments', 'commentedCode', 'scriptBeats']);
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
