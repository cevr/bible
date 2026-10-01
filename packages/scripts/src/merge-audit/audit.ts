// How a merge resolved each file it did not take from git's own merge: the
// lines one side added that the resolution dropped, and the lines one side
// removed that it brought back. A conflict resolved by taking one side's file
// whole drops every edit the other side made to it (pass 7's p7-films merge
// undid three batches' edits to the film skill that way); each such line is
// named here, so the resolution is read, not assumed.
//
// Statements are compared as a multiset, trimmed, so a moved one is neither
// added nor removed; a statement is a line, or a sentence of a prose line (a
// skill's paragraph is one line of many claims). One under 8 characters (a
// brace, a fence, a rule) is too common to say anything and is left out.

import { Option } from 'effect';

/** One file's text in the merge base, in each parent, and in the merge. */
export interface Versions {
  readonly base: string;
  readonly first: string;
  readonly second: string;
  readonly merged: string;
}

/** What the resolution did to one parent's edits of a file. */
export interface Lost {
  /** Lines the parent added over the base that the merge does not have. */
  readonly dropped: ReadonlyArray<string>;
  /** Lines the parent removed from the base (and the other parent did not add) that the merge has. */
  readonly restored: ReadonlyArray<string>;
}

const MIN_LENGTH = 8;

/** A sentence ends at `.` or `;` before a space: a prose line is several statements. */
const SENTENCE_END = /(?<=[.;])\s+/;

/** A text's statements: each line, a prose line split at its sentences, trimmed. */
const linesOf = (text: string): ReadonlyArray<string> =>
  text
    .split('\n')
    .flatMap((line) => line.split(SENTENCE_END))
    .map((line) => line.trim())
    .filter((line) => line.length >= MIN_LENGTH);

const counts = (lines: ReadonlyArray<string>): Map<string, number> => {
  const out = new Map<string, number>();
  for (const line of lines) out.set(line, (out.get(line) ?? 0) + 1);
  return out;
};

/** The lines of `to` beyond those of `from`, as a multiset: each extra copy once. */
const beyond = (to: string, from: string): ReadonlyArray<string> => {
  const had = counts(linesOf(from));
  const out: Array<string> = [];
  for (const line of linesOf(to)) {
    const left = had.get(line) ?? 0;
    if (left > 0) had.set(line, left - 1);
    else out.push(line);
  }
  return out;
};

/** What the merge did to `side`'s edits of the base, given the `other` parent. */
const lostOf = (base: string, side: string, other: string, merged: string): Lost => {
  const kept = new Set(linesOf(merged));
  const otherAdded = new Set(beyond(other, base));
  return {
    dropped: beyond(side, base).filter((line) => !kept.has(line)),
    restored: beyond(base, side).filter((line) => kept.has(line) && !otherAdded.has(line)),
  };
};

/** What a merge did to each parent's edits of one file. */
export interface LostEdits {
  readonly first: Lost;
  readonly second: Lost;
}

/** What the merge did to each parent's edits of one file. */
export const lostEdits = (v: Versions): LostEdits => ({
  first: lostOf(v.base, v.first, v.second, v.merged),
  second: lostOf(v.base, v.second, v.first, v.merged),
});

const quoted = (line: string) => {
  if (line.length <= 120) return `"${line}"`;
  return `"${line.slice(0, 117)}…"`;
};

/**
 * The audit's lines for one file: `merge-audit <file> dropped ^1: "<line>"` and
 * `merge-audit <file> restored ^2: "<line>"`, one per line lost, or one line
 * saying the file keeps both parents' edits.
 */
export const fileLines = (file: string, lost: LostEdits): ReadonlyArray<string> => {
  const each = (parent: '^1' | '^2', l: Lost) => [
    ...l.dropped.map((line) => `merge-audit ${file} dropped ${parent}: ${quoted(line)}`),
    ...l.restored.map((line) => `merge-audit ${file} restored ${parent}: ${quoted(line)}`),
  ];
  const out = [...each('^1', lost.first), ...each('^2', lost.second)];
  if (out.length === 0) return [`merge-audit ${file} keeps both parents' edits`];
  return out;
};

/**
 * A merge's first line: the merge, the files git left conflicted, and those the
 * resolution changed. A merge of main made inside the merged branch names
 * the outer merge it is `inside`.
 */
export const headLine = (
  merge: string,
  conflicted: ReadonlyArray<string>,
  changed: ReadonlyArray<string>,
  inside: Option.Option<string> = Option.none(),
): string =>
  [
    `merge-audit ${merge.slice(0, 8)}`,
    ...Option.toArray(Option.map(inside, (outer) => `inside ${outer.slice(0, 8)}`)),
    `conflicted=${conflicted.length} resolved-by-hand=${changed.length}`,
  ].join(' ');

/** The paths `git merge-tree --write-tree` lists as conflicted: `<mode> <oid> <stage>\t<path>` lines. */
export const conflictedPaths = (mergeTreeOut: string): ReadonlyArray<string> => {
  const paths = new Set<string>();
  for (const line of mergeTreeOut.split('\n').slice(1)) {
    const at = line.indexOf('\t');
    if (/^\d{6} [0-9a-f]+ [123]$/.test(line.slice(0, at))) paths.add(line.slice(at + 1));
  }
  return [...paths];
};
