// The files the gate reads: the repo's work, as git and the workspaces name
// it. A file is the repo's when git tracks it (committed or staged), or when
// it is new, not ignored by git, and inside a workspace the root's
// `package.json` declares (`packages/*`, `apps/*`): an agent's new module
// is read before it is staged. A new folder outside every workspace, such as
// the owner's `prototypes/` in the main checkout, is no one's work yet, so
// no guard reads it. A tracked file deleted from the tree is none.
//
// The lint (`lint.ts`), the format check (`fmt.ts`) and the judged rules'
// items (`judged/sources.ts`) read this one list, so the three never
// disagree on what the repo holds.

import { Glob, JSONC } from 'bun';
import { Effect, FileSystem, Path, Schema, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

/** A git command exited non-zero: its subcommand and its code (git's own words are dropped). */
class GitFailed extends Schema.TaggedError<GitFailed>()('GitFailed', {
  command: Schema.String,
  code: Schema.Finite,
}) {
  override get message() {
    return `git ${this.command} exited ${this.code}`;
  }
}

/** `git <args>` run in `root`: what it prints, or `GitFailed` when it exits non-zero. */
const git = (root: string, args: ReadonlyArray<string>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make('git', args, {
          cwd: root,
          stderr: 'ignore',
          forceKillAfter: '5 seconds',
        }),
      );
      const [out, code] = yield* Effect.all(
        [Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
        { concurrency: 2 },
      );
      if (code !== 0)
        return yield* GitFailed.make({
          command: args.find((arg) => !arg.startsWith('-') && !arg.includes('=')) ?? 'git',
          code,
        });
      return out;
    }),
  );

/** The root of the repo at `cwd`, as git names it. */
export const repoRoot = (cwd: string) =>
  Effect.map(git(cwd, ['rev-parse', '--show-toplevel']), (out) => out.trim());

/** The names a NUL-separated git listing holds. */
const namesOf = (listing: string) => listing.split('\0').filter((name) => name !== '');

/** What the gate reads of the root's `package.json`: its workspace globs. */
const RootPackage = Schema.Struct({ workspaces: Schema.optional(Schema.Array(Schema.String)) });

/**
 * The workspace globs of the root's `package.json` (`packages/*`), each as a
 * glob of the files under it; none when it has no `package.json` or names
 * none.
 */
const workspacesOf = Effect.fn('guard.workspacesOf')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(root, 'package.json');
  if (!(yield* fs.exists(file))) return [];
  const text = yield* fs.readFileString(file);
  const { workspaces = [] } = yield* Schema.decodeEffect(Schema.fromJsonString(RootPackage))(text);
  return workspaces.map((glob) => new Glob(`${glob.replace(/\/+$/, '')}/**`));
});

/**
 * The repo's files at `root`, relative to it with `/` between their parts,
 * sorted: every file git tracks, and every new file git does not ignore
 * inside a workspace, less the tracked ones deleted from the tree.
 */
export const gateFiles = Effect.fn('guard.gateFiles')(function* (root: string) {
  const [tracked, fresh, deleted, workspaces] = yield* Effect.all(
    [
      git(root, ['ls-files', '-z', '--cached']),
      git(root, ['ls-files', '-z', '--others', '--exclude-standard']),
      git(root, ['ls-files', '-z', '--deleted']),
      workspacesOf(root),
    ],
    { concurrency: 4 },
  );
  const gone = new Set(namesOf(deleted));
  const inWorkspace = (file: string) => workspaces.some((glob) => glob.match(file));
  return [...new Set([...namesOf(tracked), ...namesOf(fresh).filter(inWorkspace)])]
    .filter((file) => !gone.has(file))
    .toSorted();
});

/**
 * The files git tracks at `root` that its ignore rules name (a `.gitignore`,
 * `.git/info/exclude`, the user's excludes), relative to it, sorted.
 */
export const ignoredTracked = Effect.fn('guard.ignoredTracked')(function* (root: string) {
  return namesOf(
    yield* git(root, ['ls-files', '-z', '--cached', '--ignored', '--exclude-standard']),
  ).toSorted();
});

/** What the gate reads of the lint config: its ignore patterns. */
const LintConfig = Schema.Struct({ ignorePatterns: Schema.optional(Schema.Array(Schema.String)) });

/** The lint config is not JSONC, or its `ignorePatterns` is not a list of globs. */
class LintConfigUnreadable extends Schema.TaggedError<LintConfigUnreadable>()(
  'LintConfigUnreadable',
  { file: Schema.String, detail: Schema.String },
) {
  override get message() {
    return `${this.file}: ${this.detail}`;
  }
}

/**
 * Whether the lint's `ignorePatterns` (`.oxlintrc.json` at `root`) name a
 * file, as a predicate over a path relative to the root: oxlint drops an
 * ignored file it is handed, and refuses a run handed nothing else.
 */
export const lintIgnored = Effect.fn('guard.lintIgnored')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(root, '.oxlintrc.json');
  const text = yield* fs.readFileString(file);
  const parsed = yield* Effect.try({
    try: (): unknown => JSONC.parse(text),
    catch: () => LintConfigUnreadable.make({ file, detail: 'not JSONC' }),
  });
  const config = yield* Schema.decodeUnknownEffect(LintConfig)(parsed).pipe(
    Effect.mapError(() => LintConfigUnreadable.make({ file, detail: 'ignorePatterns unread' })),
  );
  const globs = (config.ignorePatterns ?? []).map((pattern) => new Glob(pattern));
  return (name: string) => globs.some((glob) => glob.match(name));
});
