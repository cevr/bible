/**
 * The full report of a corpus sync, in Markdown.
 *
 * The run's mail says what a week brought and shows its first changes
 * (`./sync-mail.ts`); this is the rest, kept in R2 (`SyncReports`) and served
 * at `egw.cvr.im/sync/<name>` (`./sync-pages.ts`), or read in a terminal with
 * `bible egw report`. It lists every book added, every paragraph a library
 * update changed (edits word by word), what checking an older book against
 * the library corrected, and what failed.
 *
 * Plain functions over plain data: the Workflow reads the changes and writes
 * the file; nothing here touches either.
 */

import { Array as Arr } from 'effect';

import type {
  EgwParagraphChangeCounts,
  EgwSyncBook,
  EgwSyncFailure,
} from '@bible/core/corpus-supply';
import type { ParagraphChangeRow } from '@bible/core/egw-db';

import { wordDiff } from './word-diff.ts';

/** The parts of the sync's report the mail and the report read. */
export interface SyncCounts {
  readonly remote: number;
  readonly installedBefore: number;
  readonly unexpectedFailures: number;
  readonly present: number;
  readonly failures: readonly EgwSyncFailure[];
}

/** A book installed again, and what that changed in it. */
export interface RecheckedBook {
  readonly book: EgwSyncBook;
  readonly changes: EgwParagraphChangeCounts;
}

/** A book whose vectors failed after it was installed. */
export interface VectorFailure {
  readonly id: number;
  readonly reason: string;
}

/** What a sync did, as plain data. */
export interface SyncRun {
  readonly counts: SyncCounts;
  /** Books the corpus did not have. */
  readonly added: readonly EgwSyncBook[];
  /** Books whose content hash moved: the library changed them. */
  readonly updated: readonly RecheckedBook[];
  /** Older books checked against the library for the first time. */
  readonly verified: readonly RecheckedBook[];
  /** Books still to recheck, left for a later run. */
  readonly recheckLeft: number;
  readonly vectorFailures: readonly VectorFailure[];
}

/** One changed paragraph, with the book it is in. */
export interface BookChange {
  readonly book: EgwSyncBook;
  readonly change: ParagraphChangeRow;
}

/** The paragraphs each rechecked book changed, by book id. */
export type ChangesByBook = ReadonlyMap<number, readonly ParagraphChangeRow[]>;

/** The changes a library update made, in the order the report lists them. */
export const updateChanges = (run: SyncRun, changes: ChangesByBook): readonly BookChange[] =>
  run.updated.flatMap(({ book }) =>
    (changes.get(book.id) ?? []).map((change) => ({ book, change })),
  );

/** How many changes a recheck made, said in words: `2 edited, 1 added`. */
export const changeSummary = (changes: EgwParagraphChangeCounts): string => {
  const parts = [
    [changes.edited, 'edited'],
    [changes.added, 'added'],
    [changes.removed, 'removed'],
  ] as const;
  const said = parts
    .filter(([count]) => count > 0)
    .map(([count, word]) => `${String(count)} ${word}`);
  if (said.length === 0) return 'no text changes';
  return said.join(', ');
};

export const changeCount = (changes: EgwParagraphChangeCounts): number =>
  changes.added + changes.removed + changes.edited;

/** Where a paragraph is: its refcode, else its book and id. */
export const changeLabel = (book: EgwSyncBook, change: ParagraphChangeRow): string =>
  change.refcode_short ?? `${book.code} ${change.para_id ?? change.ref_code}`;

const MARKDOWN_SPECIAL = /[\\`*_[\]{}()<>#+\-.!|~]/g;

/** Text as Markdown shows it literally: no emphasis, link or HTML in a
 *  paragraph's words becomes markup. */
export const escapeMarkdown = (text: string): string =>
  text.replace(MARKDOWN_SPECIAL, (character) => `\\${character}`);

/** An edited paragraph as one quote: removed words struck, added ones bold. */
const editedQuote = (before: string, after: string): string =>
  wordDiff(before, after)
    .map((segment) => {
      const text = escapeMarkdown(segment.text);
      if (segment.kind === 'removed') return `~~${text}~~`;
      if (segment.kind === 'added') return `**${text}**`;
      return text;
    })
    .join(' ');

const changeBlock = (book: EgwSyncBook, change: ParagraphChangeRow): string => {
  const heading = `**${escapeMarkdown(changeLabel(book, change))}** · ${change.kind}`;
  const before = change.before_text ?? '';
  const after = change.after_text ?? '';
  let quote = escapeMarkdown(after);
  if (change.kind === 'edited') quote = editedQuote(before, after);
  if (change.kind === 'removed') quote = `~~${escapeMarkdown(before)}~~`;
  return `${heading}\n\n> ${quote}`;
};

const bookHeading = (book: EgwSyncBook) =>
  `${escapeMarkdown(book.code)} — ${escapeMarkdown(book.title)}`;

const bookLine = (book: EgwSyncBook) =>
  `- **${escapeMarkdown(book.code)}** ${escapeMarkdown(book.title)}`;

/** Lines shown only when a list has something in it. */
const ifAny = <A>(items: readonly A[], lines: (some: readonly A[]) => readonly string[]) =>
  Arr.match(items, { onEmpty: (): readonly string[] => [], onNonEmpty: lines });

const recheckedSection = (
  title: string,
  intro: string,
  books: readonly RecheckedBook[],
  changes: ChangesByBook,
): readonly string[] => {
  const changed = books.filter(({ changes: counts }) => changeCount(counts) > 0);
  const same = books.filter(({ changes: counts }) => changeCount(counts) === 0);
  return ifAny(books, () => [
    `## ${title} (${String(books.length)})`,
    intro,
    ...ifAny(same, (some) => [
      `Unchanged (${String(some.length)}): ${some.map(({ book }) => escapeMarkdown(book.code)).join(', ')}.`,
    ]),
    ...changed.flatMap(({ book, changes: counts }) => [
      `### ${bookHeading(book)}`,
      `${changeSummary(counts)}.`,
      ...(changes.get(book.id) ?? []).map((change) => changeBlock(book, change)),
    ]),
  ]);
};

const failureLine = (failure: EgwSyncFailure) =>
  `- **${escapeMarkdown(failure.code)}** ${escapeMarkdown(failure.title)}: ${escapeMarkdown(failure.error)}`;

/** The whole report, for one run. */
export const syncReport = (run: SyncRun, changes: ChangesByBook, at: string): string => {
  const { counts } = run;
  const unexpected = counts.failures.filter((failure) => !failure.expected);
  const expected = counts.failures.filter((failure) => failure.expected);
  const sections: readonly (readonly string[])[] = [
    [
      `# EGW sync, ${at.slice(0, 10)}`,
      `The library lists ${String(counts.remote)} books. The corpus holds ${String(counts.present)}; ` +
        `it held ${String(counts.installedBefore)} before this run.`,
    ],
    ifAny(run.added, (some) => [
      `## Added (${String(some.length)})`,
      some.map(bookLine).join('\n'),
    ]),
    recheckedSection(
      'Updated by the library',
      'Books whose archive changed since they were installed, and every paragraph that changed with them.',
      run.updated,
      changes,
    ),
    recheckedSection(
      'Checked against the library',
      'Books installed before the sync kept content hashes, checked once against the library. ' +
        'What differs is what the earlier import missed, now corrected; it is not a change the library made. ' +
        `${String(run.recheckLeft)} books are still to check.`,
      run.verified,
      changes,
    ),
    ifAny(unexpected, (some) => [
      `## Failed unexpectedly (${String(some.length)})`,
      some.map(failureLine).join('\n'),
    ]),
    ifAny(run.vectorFailures, (some) => [
      `## Installed without vectors (${String(some.length)})`,
      'A `reembed` run adds them.',
      some
        .map((failed) => `- book ${String(failed.id)}: ${escapeMarkdown(failed.reason)}`)
        .join('\n'),
    ]),
    ifAny(expected, (some) => [
      `## Withheld by the library (${String(some.length)})`,
      `Listed but not served, as expected: ${some.map((failure) => escapeMarkdown(failure.code)).join(', ')}.`,
    ]),
  ];
  return `${sections.flat().join('\n\n')}\n`;
};
