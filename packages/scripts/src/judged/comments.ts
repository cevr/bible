// The changed-comments selector: the comment blocks of the TypeScript files
// the repo lints that touch a line added or changed against a merge base.
// A block is a block comment (JSDoc included), or a run of line comments on
// lines one after another, each the first thing on its line; a line comment
// after code is a block of its own. Each block goes to a judged rule whole,
// as one item, with its file and its first line.

import { Glob, JSONC } from 'bun';
import { Effect, FileSystem, Option, Path, Schema, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import { parseSync } from 'oxc-parser';

/** One comment block a judged rule reads: its file, its first line and its words. */
export interface CommentItem {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/** A comment block of a source: its first and last lines (1-based) and its words. */
interface Block {
  readonly line: number;
  readonly end: number;
  readonly text: string;
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

/** A comment's words: its markers, a JSDoc line's leading `*` and the edges' blank lines gone. */
const wordsOf = (type: 'Line' | 'Block', value: string) => {
  if (type === 'Line') return value.replace(/^ /, '').trimEnd();
  return value
    .split('\n')
    .map((line) => line.replace(/^\s*\*? ?/, '').trimEnd())
    .join('\n')
    .trim();
};

/** The 1-based line of each offset in `source`, by its line starts. */
const lineReader = (source: string) => {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
  return {
    lineOf: (offset: number) => {
      let low = 0;
      let high = starts.length - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if ((starts[mid] ?? 0) <= offset) low = mid;
        else high = mid - 1;
      }
      return low + 1;
    },
    startOf: (line: number) => starts[line - 1] ?? 0,
  };
};

/** Each comment block of `source`, in order. */
const commentBlocks = (file: string, source: string): ReadonlyArray<Block> => {
  const { comments } = parseSync(file, source);
  const { lineOf, startOf } = lineReader(source);
  const blocks: Array<{ line: number; end: number; words: Array<string>; run: boolean }> = [];
  for (const comment of comments) {
    const line = lineOf(comment.start);
    const end = lineOf(comment.end);
    const alone = source.slice(startOf(line), comment.start).trim() === '';
    const run = comment.type === 'Line' && alone;
    const last = blocks.at(-1);
    const words = wordsOf(comment.type, comment.value);
    if (run && last?.run === true && last.end === line - 1) {
      last.end = end;
      last.words.push(words);
    } else blocks.push({ line, end, words: [words], run });
  }
  return blocks.map((b) => ({ line: b.line, end: b.end, text: b.words.join('\n').trim() }));
};

/** The blocks of `source` that touch one of `changed`, as items of `file`; a block with no words is none. */
const changedBlocks = (
  file: string,
  source: string,
  changed: ReadonlySet<number>,
): ReadonlyArray<CommentItem> =>
  commentBlocks(file, source)
    .filter((b) => b.text !== '')
    .filter((b) => {
      for (let line = b.line; line <= b.end; line++) if (changed.has(line)) return true;
      return false;
    })
    .map((b) => ({ file, line: b.line, text: b.text }));

const TYPESCRIPT = /\.[cm]?tsx?$/;

/** Whether the repo lints `file`: a TypeScript source (no `.d.ts`) none of the lint's ignore patterns names. */
const linted = (file: string, ignorePatterns: ReadonlyArray<string>) =>
  TYPESCRIPT.test(file) &&
  !file.endsWith('.d.ts') &&
  !ignorePatterns.some((pattern) => new Glob(pattern).match(file));

const LintConfig = Schema.Struct({
  ignorePatterns: Schema.optional(Schema.Array(Schema.String)),
});

/** A git command exited non-zero: its subcommand and its code (git's own words are dropped). */
class GitFailed extends Schema.TaggedError<GitFailed>()('GitFailed', {
  command: Schema.String,
  code: Schema.Finite,
}) {
  override get message() {
    return `git ${this.command} exited ${this.code}`;
  }
}

/** The repo's lint config is not JSONC, or not the shape it reads. */
class LintConfigUnreadable extends Schema.TaggedError<LintConfigUnreadable>()(
  'LintConfigUnreadable',
  { file: Schema.String },
) {
  override get message() {
    return `${this.file} does not read as a lint config`;
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

/** The ignore patterns of the lint config at `file`, from its text. */
const ignorePatternsOf = (file: string, text: string) =>
  Effect.try({
    try: () => JSONC.parse(text),
    catch: () => LintConfigUnreadable.make({ file }),
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(LintConfig)),
    Effect.mapError(() => LintConfigUnreadable.make({ file })),
    Effect.map((config) => config.ignorePatterns ?? []),
  );

/**
 * The comment items of the linted TypeScript files whose lines the working
 * tree adds or changes against the merge base of `base` and HEAD.
 */
export const changedComments = Effect.fn('judged.changedComments')(function* (
  root: string,
  base: string,
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
  const configFile = path.join(root, '.oxlintrc.json');
  const ignorePatterns = yield* ignorePatternsOf(
    '.oxlintrc.json',
    yield* fs.readFileString(configFile),
  );
  const files = [...changedLines(diff)].filter(([file]) => linted(file, ignorePatterns));
  const items = yield* Effect.forEach(
    files,
    ([file, lines]) =>
      Effect.map(fs.readFileString(path.join(root, file)), (source) =>
        changedBlocks(file, source, lines),
      ),
    { concurrency: 8 },
  );
  return items.flat();
});
