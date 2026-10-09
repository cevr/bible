import { describe, expect, test } from 'bun:test';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Exit, FileSystem, Option, Path, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { grownOver } from './base.js';

const FILES: Parameters<typeof grownOver>[1] = { check: 'd/check.ts', debt: 'd/debt.txt' };

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

/** Writes `text` to `file` under `dir`. */
const write = (dir: string, file: string, text: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(path.dirname(path.join(dir, file)), { recursive: true });
    yield* fs.writeFileString(path.join(dir, file), text);
  });

/** Commits everything under `dir`; answers the commit. */
const commit = (dir: string, message: string) =>
  Effect.gen(function* () {
    yield* git(dir, 'add', '-A');
    yield* git(dir, 'commit', '-qm', message);
    return yield* git(dir, 'rev-parse', 'HEAD');
  });

/** Sets the debt file to `lines` and commits it. */
const commitDebt = (dir: string, lines: ReadonlyArray<string>, message: string) =>
  Effect.gen(function* () {
    yield* write(dir, FILES.debt, lines.map((line) => `${line}\n`).join(''));
    return yield* commit(dir, message);
  });

/** A repository whose `main` holds the check and a debt of `a`; answers its directory. */
const repo = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const dir = yield* fs.makeTempDirectory({ prefix: 'dead-base-' });
  yield* git(dir, 'init', '-q', '-b', 'main');
  yield* write(dir, FILES.check, '// the check\n');
  yield* commitDebt(dir, ['a'], 'one');
  return dir;
});

const run = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
  >,
) => Effect.runPromise(effect.pipe(Effect.scoped, Effect.provide(BunServices.layer)));

const none = Option.none<string>();
const fails = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.map(Effect.exit(effect), Exit.isFailure);

describe('the debt held against its base', () => {
  test("a branch's debt is held to its merge-base with main: a line main lacks is grown, one it has is not", () =>
    run(
      Effect.gen(function* () {
        const dir = yield* repo;
        yield* git(dir, 'checkout', '-q', '-b', 'topic');
        yield* commitDebt(dir, ['a', 'b'], 'grow');
        expect(yield* grownOver(dir, FILES, none, ['a', 'b'])).toEqual(['b']);
        expect(yield* grownOver(dir, FILES, none, ['a'])).toEqual([]);
      }),
    ));

  test("on main itself the debt is held to the head's parent", () =>
    run(
      Effect.gen(function* () {
        const dir = yield* repo;
        yield* commitDebt(dir, ['a', 'b'], 'grow on main');
        expect(yield* grownOver(dir, FILES, none, ['a', 'b'])).toEqual(['b']);
      }),
    ));

  test('with no git repository, or no parent to read, the check has no base and fails', () =>
    run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const bare = yield* fs.makeTempDirectory({ prefix: 'dead-nogit-' });
        expect(yield* fails(grownOver(bare, FILES, none, []))).toBe(true);
        expect(yield* fails(grownOver(yield* repo, FILES, none, ['a']))).toBe(true);
      }),
    ));

  // A push of two commits: the first grows the debt, the second is unrelated.
  // Against the head's parent the growth is hidden; against the pre-push SHA it is not.
  test('a push of several commits is held to the pre-push SHA, whatever the last commit touched', () =>
    run(
      Effect.gen(function* () {
        const dir = yield* repo;
        const before = yield* git(dir, 'rev-parse', 'HEAD');
        yield* commitDebt(dir, ['a', 'b'], 'adds a dead export and its debt line');
        yield* write(dir, 'd/other.txt', 'unrelated\n');
        yield* commit(dir, 'unrelated');
        expect(yield* grownOver(dir, FILES, none, ['a', 'b'])).toEqual([]);
        expect(yield* grownOver(dir, FILES, Option.some(before), ['a', 'b'])).toEqual(['b']);
      }),
    ));

  test('a base named outright that git cannot read fails; an all-zero one is a new branch and the local rule stands', () =>
    run(
      Effect.gen(function* () {
        const dir = yield* repo;
        yield* git(dir, 'checkout', '-q', '-b', 'topic');
        yield* commitDebt(dir, ['a', 'b'], 'topic');
        const unreadable = Option.some('1234567890123456789012345678901234567890');
        expect(yield* fails(grownOver(dir, FILES, unreadable, ['a', 'b']))).toBe(true);
        const zeros = Option.some('0000000000000000000000000000000000000000');
        expect(yield* grownOver(dir, FILES, zeros, ['a', 'b'])).toEqual(['b']);
      }),
    ));

  test('a base before the check was adopted holds nothing; a base with the check and no debt file fails', () =>
    run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* fs.makeTempDirectory({ prefix: 'dead-adopt-' });
        yield* git(dir, 'init', '-q', '-b', 'main');
        yield* write(dir, 'readme.txt', 'no check yet\n');
        const before = yield* commit(dir, 'before the check');
        yield* write(dir, FILES.check, '// the check\n');
        yield* commitDebt(dir, ['a', 'b'], 'adopt the check');
        expect(yield* grownOver(dir, FILES, Option.some(before), ['a', 'b'])).toEqual([]);
        // The bypass: the debt file deleted, then recreated with more.
        yield* fs.remove(path.join(dir, FILES.debt));
        const deleted = yield* commit(dir, 'delete the debt');
        yield* commitDebt(dir, ['a', 'b', 'c'], 'recreate it with more');
        expect(yield* fails(grownOver(dir, FILES, Option.some(deleted), ['a', 'b', 'c']))).toBe(
          true,
        );
      }),
    ));

  // `main` left behind while `origin/main` moved on: the branch left the newer one.
  test('a stale local main does not win over a current origin/main', () =>
    run(
      Effect.gen(function* () {
        const dir = yield* repo;
        yield* git(dir, 'checkout', '-q', '-b', 'topic');
        const current = yield* commitDebt(dir, ['a', 'b'], 'main moved on (as origin/main has it)');
        yield* git(dir, 'update-ref', 'refs/remotes/origin/main', current);
        yield* write(dir, 'd/other.txt', 'x\n');
        yield* commit(dir, 'topic work');
        expect(yield* grownOver(dir, FILES, none, ['a', 'b'])).toEqual([]);
      }),
    ));

  test('a local main ahead of origin/main is the base: the descendant wins', () =>
    run(
      Effect.gen(function* () {
        const dir = yield* repo;
        const stale = yield* git(dir, 'rev-parse', 'HEAD');
        yield* git(dir, 'checkout', '-q', '-b', 'topic');
        const current = yield* commitDebt(dir, ['a', 'b'], 'main moved on');
        yield* git(dir, 'branch', '-f', 'main', current);
        yield* git(dir, 'update-ref', 'refs/remotes/origin/main', stale);
        yield* write(dir, 'd/other.txt', 'x\n');
        yield* commit(dir, 'topic work');
        expect(yield* grownOver(dir, FILES, none, ['a', 'b'])).toEqual([]);
      }),
    ));

  test('diverged main and origin/main: origin/main is the base', () =>
    run(
      Effect.gen(function* () {
        const dir = yield* repo;
        yield* git(dir, 'checkout', '-q', '-b', 'side');
        const side = yield* commitDebt(dir, ['a', 's'], 'origin/main');
        yield* git(dir, 'update-ref', 'refs/remotes/origin/main', side);
        yield* git(dir, 'checkout', '-q', 'main');
        yield* commitDebt(dir, ['a', 'b'], 'local main');
        yield* git(dir, 'checkout', '-q', '-b', 'topic', side);
        yield* write(dir, 'd/other.txt', 'x\n');
        yield* commit(dir, 'topic work');
        expect(yield* grownOver(dir, FILES, none, ['a', 's'])).toEqual([]);
      }),
    ));
});
