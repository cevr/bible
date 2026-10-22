import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Path } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import { TEST_GIT } from '../testing.js';
import { STAGED_FILES, typecheckedBy } from './workspaces.js';

const workspaces = [
  { dir: 'packages/a', name: '@bible/a' },
  { dir: 'packages/b', name: '@bible/b' },
];

describe("a commit's staged files", () => {
  it.effect.layer(BunServices.layer)(
    'name a file moved across workspaces at both paths, so both are typechecked',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner;
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'staged-' });
        const git = (args: ReadonlyArray<string>) =>
          spawner.string(
            ChildProcess.make('git', [...TEST_GIT, ...args], {
              cwd: dir,
              forceKillAfter: '5 seconds',
            }),
          );
        yield* git(['init', '-q']);
        yield* fs.makeDirectory(path.join(dir, 'packages/a/src'), { recursive: true });
        yield* fs.makeDirectory(path.join(dir, 'packages/b/src'), { recursive: true });
        yield* fs.writeFileString(
          path.join(dir, 'packages/a/src/moved.ts'),
          'export const moved = "a file long enough for git to see it renamed";\n',
        );
        yield* git(['add', '.']);
        yield* git(['commit', '-q', '-m', 'first']);
        yield* git(['mv', 'packages/a/src/moved.ts', 'packages/b/src/moved.ts']);
        const staged = (yield* git(STAGED_FILES)).split('\n').filter((line) => line.length > 0);
        expect(staged.toSorted()).toEqual(['packages/a/src/moved.ts', 'packages/b/src/moved.ts']);
        expect(typecheckedBy(staged, workspaces)).toEqual(['@bible/a', '@bible/b']);
      }).pipe(Effect.scoped),
  );
});
