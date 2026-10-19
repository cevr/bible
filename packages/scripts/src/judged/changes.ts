// The changed items: the items of the judged rules' selectors (`items.ts`)
// in the files the repo lints that touch a line the working tree adds or
// changes against a merge base. A file is a TypeScript source (no `.d.ts`)
// that none of the lint's ignore patterns names, or a series script's
// Markdown, which only `scriptBeats` reads. Each source is read and parsed
// once for every rule that reads it.

import { Glob } from 'bun';
import { Effect, FileSystem, Option, Path, Schema, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import { type Item, type Selector, itemsOf, markdownBeats, parse, selects } from './items.js';

/** One item of a changed source: its selector, its file and the item. */
interface ChangedItem extends Item {
  readonly selector: Selector;
  readonly file: string;
}

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/** The byte each of git's C escapes stands for (`\t`, `\"`); an octal escape is its own. */
const ESCAPED = new Map([
  ['a', 7],
  ['b', 8],
  ['t', 9],
  ['n', 10],
  ['v', 11],
  ['f', 12],
  ['r', 13],
  ['"', 34],
  ['\\', 92],
]);

/** The bytes one escape (`\303`, `\"`) of a quoted name stands for. */
const escapedByte = (escape: string) => {
  if (/^[0-7]{3}$/.test(escape)) return parseInt(escape, 8);
  return Option.getOrElse(Option.fromUndefinedOr(ESCAPED.get(escape)), () => escape.charCodeAt(0));
};

/** A name as git writes it in a header: C-quoted (`"b/say \"hi\".ts"`, octal for bytes) when it must be. */
const unquoted = (name: string) => {
  if (!name.startsWith('"') || !name.endsWith('"')) return name;
  const encoder = new TextEncoder();
  const bytes = [...name.slice(1, -1).matchAll(/\\([0-7]{3}|.)|([^\\]+)/gsu)].flatMap((match) =>
    Option.match(Option.fromUndefinedOr(match[2]), {
      onSome: (run) => [...encoder.encode(run)],
      onNone: () => [escapedByte(match[1] ?? '')],
    }),
  );
  return new TextDecoder().decode(new Uint8Array(bytes));
};

/**
 * The new-side lines each file's hunks add or change, read from `git diff-index
 * -p --unified=0 --dst-prefix=b/`. A file's `+++` header is read only between
 * its `diff --git` row and its first hunk, so an added line that starts `++`
 * is code; the name loses the TAB git ends a name with a space by.
 */
const changedLines = (diff: string): ReadonlyMap<string, ReadonlySet<number>> => {
  const changed = new Map<string, Set<number>>();
  let lines = new Set<number>();
  let header = false;
  for (const row of diff.split('\n')) {
    if (row.startsWith('diff --git ')) {
      header = true;
      lines = new Set<number>();
      continue;
    }
    if (header && row.startsWith('+++ ')) {
      const name = unquoted(row.slice('+++ '.length).replace(/\t$/, ''));
      if (name.startsWith('b/')) changed.set(name.slice('b/'.length), lines);
      continue;
    }
    const hunk = HUNK.exec(row);
    if (!hunk) continue;
    header = false;
    const start = Number(hunk[1]);
    const count = Number(hunk[2] ?? '1');
    for (let line = start; line < start + count; line++) lines.add(line);
  }
  return changed;
};

const TYPESCRIPT = /\.[cm]?tsx?$/;

/** Whether the judged lint reads `file`: a TypeScript source (no `.d.ts`) none of the lint's ignore patterns names, or Markdown. */
const linted = (file: string, ignorePatterns: ReadonlyArray<string>) =>
  (file.endsWith('.md') || (TYPESCRIPT.test(file) && !file.endsWith('.d.ts'))) &&
  !ignorePatterns.some((pattern) => new Glob(pattern).match(file));

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

/** The items of `selectors` in one source that touch one of `changed`. */
const itemsChanged = (
  file: string,
  text: string,
  changed: ReadonlySet<number>,
  selectors: ReadonlyArray<Selector>,
): ReadonlyArray<ChangedItem> => {
  const reading = selectors.filter((selector) => selects(selector, file));
  if (reading.length === 0) return [];
  const touched = (item: Item) => {
    for (let line = item.line; line <= item.end; line++) if (changed.has(line)) return true;
    return false;
  };
  if (file.endsWith('.md'))
    return markdownBeats(text)
      .filter(touched)
      .map((item) => ({ ...item, selector: 'scriptBeats', file }));
  const source = parse(file, text);
  return reading.flatMap((selector) =>
    itemsOf(selector, source)
      .filter(touched)
      .map((item) => ({ ...item, selector, file })),
  );
};

/**
 * The items of `selectors` in the files the judged lint reads whose lines
 * the working tree adds or changes against the merge base of `base` and
 * HEAD, past the lint's `ignorePatterns`.
 */
export const changedItems = Effect.fn('judged.changedItems')(function* (
  root: string,
  base: string,
  ignorePatterns: ReadonlyArray<string>,
  selectors: ReadonlyArray<Selector>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const mergeBase = (yield* git(root, ['merge-base', base, 'HEAD'])).trim();
  // git's plumbing diff of the merge base against the working tree reads no
  // porcelain config (diff.interHunkContext, textconv drivers, diff.noprefix,
  // diff.mnemonicPrefix, diff.external, diff.relative, color): its hunks are
  // the source's own changed lines. `--text` patches a file an attribute marks
  // `-diff`; the prefixes and quotePath are set here all the same.
  const diff = yield* git(root, [
    '-c',
    'core.quotePath=false',
    'diff-index',
    '-p',
    '-M',
    '--text',
    '--unified=0',
    '--src-prefix=a/',
    '--dst-prefix=b/',
    '--diff-filter=AMR',
    mergeBase,
  ]);
  const files = [...changedLines(diff)].filter(([file]) => linted(file, ignorePatterns));
  const items = yield* Effect.forEach(
    files,
    ([file, lines]) =>
      Effect.map(fs.readFileString(path.join(root, file)), (text) =>
        itemsChanged(file, text, lines, selectors),
      ),
    { concurrency: 8 },
  );
  return items.flat();
});
