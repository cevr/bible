import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Path, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { gateFiles, lintIgnored } from './files.js';

/** Runs `git <args>` in `cwd`, to the end. */
const git = (cwd: string, args: ReadonlyArray<string>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make('git', args, { cwd, forceKillAfter: '5 seconds' }),
      );
      yield* Stream.runDrain(handle.stdout);
      return yield* handle.exitCode;
    }),
  );

/** A config that keeps git's own name, mail and signing out of the test repo's commits. */
const AS_TEST = ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false'];

/** Writes `files` (each its text) under `dir`. */
const write = (dir: string, files: Record<string, string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* Effect.forEach(Object.entries(files), ([file, text]) =>
      Effect.gen(function* () {
        yield* fs.makeDirectory(path.dirname(path.join(dir, file)), { recursive: true });
        yield* fs.writeFileString(path.join(dir, file), text);
      }),
    );
  });

/** A repository that commits `committed`, then has `tree` written over it uncommitted. */
const repo = (committed: Record<string, string>, tree: Record<string, string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'gate-files-' });
    yield* git(dir, ['init', '-q', '-b', 'main']);
    yield* write(dir, committed);
    yield* git(dir, ['add', '-A']);
    yield* git(dir, [...AS_TEST, 'commit', '-qm', 'base']);
    yield* write(dir, tree);
    return dir;
  });

const withFs = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.scoped, Effect.provide(BunServices.layer));

describe("the gate's files", () => {
  it.live(
    'are every tracked file, and new ones inside a workspace, less the ignored and the deleted',
    () =>
      withFs(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* repo(
            {
              'package.json': '{ "workspaces": ["packages/*", "apps/*/"] }',
              '.gitignore': 'out/\n',
              'README.md': '# root\n',
              'packages/a/src/kept.ts': 'export {};\n',
              'packages/a/src/gone.ts': 'export {};\n',
              'tools/script.ts': 'export {};\n',
            },
            {
              'packages/a/src/new.ts': 'export {};\n',
              'apps/b/new.tsx': 'export {};\n',
              'packages/a/out/built.ts': 'export {};\n',
              'prototypes/sketch/main.ts': 'export {};\n',
              'loose.png': 'png',
              'tools/staged.ts': 'export {};\n',
            },
          );
          yield* fs.remove(path.join(dir, 'packages/a/src/gone.ts'));
          yield* git(dir, ['add', 'tools/staged.ts']);
          expect(yield* gateFiles(dir)).toEqual([
            '.gitignore',
            'README.md',
            'apps/b/new.tsx',
            'package.json',
            'packages/a/src/kept.ts',
            'packages/a/src/new.ts',
            'tools/script.ts',
            'tools/staged.ts',
          ]);
        }),
      ),
  );

  it.live('are the tracked files alone when the root names no workspace', () =>
    withFs(
      Effect.gen(function* () {
        const dir = yield* repo({ 'src/a.ts': 'export {};\n' }, { 'src/b.ts': 'export {};\n' });
        expect(yield* gateFiles(dir)).toEqual(['src/a.ts']);
      }),
    ),
  );

  it.live("read the lint config's ignore patterns, JSONC comments and all", () =>
    withFs(
      Effect.gen(function* () {
        const dir = yield* repo(
          {
            '.oxlintrc.json':
              '{\n  // the lint\n  "ignorePatterns": ["**/dist/**", "**/fixtures/**"],\n}\n',
          },
          {},
        );
        const ignored = yield* lintIgnored(dir);
        expect(
          ['a/dist/x.ts', 'a/lint/fixtures/y.ts', 'a/src/z.ts'].filter((file) => ignored(file)),
        ).toEqual(['a/dist/x.ts', 'a/lint/fixtures/y.ts']);
      }),
    ),
  );

  it.live('fail, tagged, when the lint config is not JSONC', () =>
    withFs(
      Effect.gen(function* () {
        const dir = yield* repo({ '.oxlintrc.json': '{ "ignorePatterns": [' }, {});
        const failed = yield* Effect.flip(lintIgnored(dir));
        expect(failed._tag).toBe('LintConfigUnreadable');
      }),
    ),
  );
});
