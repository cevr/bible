// The repo's items: the items of the judged rules' selectors (`items.ts`)
// in every file of the working tree the repo lints, tracked or new, so a
// file never committed is read as a committed one is. A file is a
// TypeScript source (no `.d.ts`) that none of the lint's ignore patterns
// names, or a series script's Markdown, which only `scriptBeats` reads. Each
// source is read and parsed once for every rule that reads it. Which of them
// a run asks about is the store's to say (`store.ts`): an item whose text it
// answers is not asked again.

import { Glob } from 'bun';
import { Effect, FileSystem, Path, Schema, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import { type Item, type Selector, itemsOf, markdownBeats, parse, selects } from './items.js';

/** One item of a source: its selector, its file and the item. */
interface SourceItem extends Item {
  readonly selector: Selector;
  readonly file: string;
}

const TYPESCRIPT = /\.[cm]?tsx?$/;

/** Whether the judged lint reads `file`: a TypeScript source (no `.d.ts`) none of the lint's ignore patterns names, or Markdown. */
const linted = (file: string, ignored: ReadonlyArray<Glob>) =>
  (file.endsWith('.md') || (TYPESCRIPT.test(file) && !file.endsWith('.d.ts'))) &&
  !ignored.some((glob) => glob.match(file));

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
        { concurrency: 'unbounded' },
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

/** The items of `selectors` in one source. */
const itemsIn = (
  file: string,
  text: string,
  selectors: ReadonlyArray<Selector>,
): ReadonlyArray<SourceItem> => {
  const reading = selectors.filter((selector) => selects(selector, file));
  if (reading.length === 0) return [];
  if (file.endsWith('.md'))
    return markdownBeats(text).map((item) => ({ ...item, selector: 'scriptBeats', file }));
  const source = parse(file, text);
  return reading.flatMap((selector) =>
    itemsOf(selector, source).map((item) => ({ ...item, selector, file })),
  );
};

/** The names a NUL-separated git listing holds. */
const namesOf = (listing: string) => listing.split('\0').filter((name) => name !== '');

/**
 * The items of `selectors` in every file of the working tree at `root` the
 * judged lint reads, tracked or untracked (git's ignored files aside), past
 * the lint's `ignorePatterns`; a tracked file deleted from the tree is none.
 */
export const repoItems = Effect.fn('judged.repoItems')(function* (
  root: string,
  ignorePatterns: ReadonlyArray<string>,
  selectors: ReadonlyArray<Selector>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const [listed, deleted] = yield* Effect.all(
    [
      git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']),
      git(root, ['ls-files', '-z', '--deleted']),
    ],
    { concurrency: 2 },
  );
  const gone = new Set(namesOf(deleted));
  const ignored = ignorePatterns.map((pattern) => new Glob(pattern));
  const files = [...new Set(namesOf(listed))].filter(
    (file) =>
      !gone.has(file) &&
      linted(file, ignored) &&
      selectors.some((selector) => selects(selector, file)),
  );
  const items = yield* Effect.forEach(
    files,
    (file) =>
      Effect.map(fs.readFileString(path.join(root, file)), (text) =>
        itemsIn(file, text, selectors),
      ),
    { concurrency: 8 },
  );
  return items.flat();
});
