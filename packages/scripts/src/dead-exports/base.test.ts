import { describe, expect, test } from 'bun:test';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Exit, FileSystem, Option, Path, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { baseRevision, debtAt, grownDebt } from './base.js';

/** Runs `git <args>` in `cwd` and answers what it prints. */
const git = (cwd: string, ...args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const handle = yield* spawner.spawn(
          ChildProcess.make(
            'git',
            ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
            { cwd },
          ),
        );
        const out = yield* Stream.decodeText(handle.stdout).pipe(Stream.mkString);
        yield* handle.exitCode;
        return out.trim();
      }),
    );
  });

/** A repository whose `main` holds `d/debt.txt` = `a`; answers its directory. */
const repo = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectory({ prefix: 'dead-base-' });
  yield* git(dir, 'init', '-q', '-b', 'main');
  yield* fs.makeDirectory(path.join(dir, 'd'));
  yield* fs.writeFileString(path.join(dir, 'd/debt.txt'), 'a\n');
  yield* git(dir, 'add', '-A');
  yield* git(dir, 'commit', '-qm', 'one');
  return dir;
});

/** Changes `d/debt.txt` to `text` and commits it. */
const commitDebt = (dir: string, text: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.writeFileString(path.join(dir, 'd/debt.txt'), text);
    yield* git(dir, 'commit', '-qam', 'debt');
  });

const run = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
  >,
) => Effect.runPromise(effect.pipe(Effect.scoped, Effect.provide(BunServices.layer)));

describe('the debt held against its base', () => {
  test('a line the base lacks is grown debt; one it has, or a removal, is not (the red control)', () => {
    expect(grownDebt(['a', 'b'], ['a'])).toEqual(['b']);
    expect(grownDebt(['a'], ['a', 'b'])).toEqual([]);
  });

  test("a branch's base is its merge-base with main, and the debt is read there", () =>
    run(
      Effect.gen(function* () {
        const dir = yield* repo;
        const main = yield* git(dir, 'rev-parse', 'HEAD');
        yield* git(dir, 'checkout', '-q', '-b', 'topic');
        yield* commitDebt(dir, 'a\nb\n');
        expect(yield* baseRevision(dir)).toBe(main);
        const lines = yield* debtAt(dir, main, 'd/debt.txt');
        expect(Option.getOrUndefined(lines)).toEqual(['a']);
        expect(Option.isNone(yield* debtAt(dir, main, 'd/none.txt'))).toBe(true);
      }),
    ));

  test("on main itself the base is the head's parent", () =>
    run(
      Effect.gen(function* () {
        const dir = yield* repo;
        const first = yield* git(dir, 'rev-parse', 'HEAD');
        yield* commitDebt(dir, 'a\nb\n');
        expect(yield* baseRevision(dir)).toBe(first);
      }),
    ));

  test('with no git repository, or no parent to read, the check has no base and fails', () =>
    run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const bare = yield* fs.makeTempDirectory({ prefix: 'dead-nogit-' });
        expect(Exit.isFailure(yield* Effect.exit(baseRevision(bare)))).toBe(true);
        expect(Exit.isFailure(yield* Effect.exit(baseRevision(yield* repo)))).toBe(true);
      }),
    ));
});
