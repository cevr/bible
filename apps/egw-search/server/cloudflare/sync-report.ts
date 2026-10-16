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

import { Array as Arr, Option } from 'effect';

import {
  type EgwParagraphChangeCounts,
  type EgwSyncBook,
  type EgwSyncFailure,
  unavailableReason,
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

/** Why the library withholds these books, by the known list's reasons:
 *  `13 need an EGW subscription, 5 are translations licensed for reading
 *  only`. */
export const withheldReasons = (bookIds: readonly number[]): string => {
  const reasons = bookIds.map((id) => unavailableReason(id));
  const count = (reason: string) =>
    reasons.filter((found) => Option.contains(found, reason)).length;
  const parts = [
    [count('subscription'), 'needs an EGW subscription', 'need an EGW subscription'],
    [
      count('third-party-licence'),
      'is a translation licensed for reading only',
      'are translations licensed for reading only',
    ],
  ] as const;
  return parts
    .filter(([found]) => found > 0)
    .map(([found, one, many]) => {
      if (found === 1) return `1 ${one}`;
      return `${String(found)} ${many}`;
    })
    .join(', ');
};

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

/** The changes a book's section quotes, and how many more it only counts. */
interface Quoted {
  readonly rows: readonly ParagraphChangeRow[];
  readonly rest: number;
}

/** Whether a recheck's added paragraphs are quoted: a library update's are;
 *  a verified book's are counted only. */
const quotesAdded = (kind: 'updated' | 'verified') => kind === 'updated';

/** The books a section quotes: those that changed, less, for a verified
 *  book, those that only gained paragraphs. */
const quotedBooks = (books: readonly RecheckedBook[], kind: 'updated' | 'verified') =>
  books.filter(
    ({ changes: counts }) =>
      changeCount(counts) > 0 && (quotesAdded(kind) || counts.edited + counts.removed > 0),
  );

const recheckedSection = (
  title: string,
  intro: string,
  books: readonly RecheckedBook[],
  kind: 'updated' | 'verified',
  quotes: ReadonlyMap<number, Quoted>,
  markdownHref: string,
): readonly string[] => {
  const same = books.filter(({ changes: counts }) => changeCount(counts) === 0);
  const quoted = quotedBooks(books, kind);
  const onlyAdded = books.filter((book) => changeCount(book.changes) > 0 && !quoted.includes(book));
  return ifAny(books, () => [
    `## ${title} (${String(books.length)})`,
    intro,
    ...ifAny(same, (some) => [
      `Unchanged (${String(some.length)}): ${some.map(({ book }) => escapeMarkdown(book.code)).join(', ')}.`,
    ]),
    ...ifAny(onlyAdded, (some) => [
      `Only gained paragraphs (${String(some.length)}): ` +
        `${some.map(({ book, changes: counts }) => `${escapeMarkdown(book.code)} \\+${String(counts.added)}`).join(', ')}.`,
    ]),
    ...quoted.flatMap(({ book, changes: counts }) => {
      const { rows, rest } = quotes.get(book.id) ?? { rows: [], rest: 0 };
      const more: string[] = [];
      if (rest > 0) more.push(`${String(rest)} more in [the full report](${markdownHref}).`);
      return [
        `### ${bookHeading(book)}`,
        `${changeSummary(counts)}.`,
        ...rows.map((change) => changeBlock(book, change)),
        ...more,
      ];
    }),
  ]);
};

/** How a report is written: whole, or as a page that quotes at most
 *  `quoteLimit` changes and links the whole for the rest. */
export interface ReportForm {
  readonly quoteLimit: Option.Option<number>;
  readonly markdownHref: string;
}

/** The whole report: every change quoted. */
export const WHOLE: ReportForm = { quoteLimit: Option.none(), markdownHref: '' };

/** Each quoted book's changes, in report order, within the form's limit. */
const quotesOf = (run: SyncRun, changes: ChangesByBook, form: ReportForm) => {
  const books = [
    ...quotedBooks(run.updated, 'updated').map((book) => [book, 'updated'] as const),
    ...quotedBooks(run.verified, 'verified').map((book) => [book, 'verified'] as const),
  ];
  const quotes = new Map<number, Quoted>();
  let left = Option.getOrElse(form.quoteLimit, () => Number.POSITIVE_INFINITY);
  for (const [{ book }, kind] of books) {
    const rows = (changes.get(book.id) ?? []).filter(
      (change) => quotesAdded(kind) || change.kind !== 'added',
    );
    const taken = rows.slice(0, Math.max(0, left));
    left -= taken.length;
    quotes.set(book.id, { rows: taken, rest: rows.length - taken.length });
  }
  return quotes;
};

const failureLine = (failure: EgwSyncFailure) =>
  `- **${escapeMarkdown(failure.code)}** ${escapeMarkdown(failure.title)}: ${escapeMarkdown(failure.error)}`;

/** The report of one run, in the form asked. */
export const syncReport = (
  run: SyncRun,
  changes: ChangesByBook,
  at: string,
  form: ReportForm = WHOLE,
): string => {
  const { counts } = run;
  const quotes = quotesOf(run, changes, form);
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
      'updated',
      quotes,
      form.markdownHref,
    ),
    recheckedSection(
      'Checked against the library',
      'Books installed before the sync kept content hashes, checked once against the library. ' +
        'What differs is what the earlier import missed, now corrected; it is not a change the library made. ' +
        'Paragraphs it gained are counted, not quoted: they are mostly headings the earlier import dropped. ' +
        `${String(run.recheckLeft)} books are still to check.`,
      run.verified,
      'verified',
      quotes,
      form.markdownHref,
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
      `Listed but not served, as expected (${withheldReasons(some.map((failure) => failure.id))}): ` +
        `${some.map((failure) => escapeMarkdown(failure.code)).join(', ')}.`,
    ]),
  ];
  return `${sections.flat().join('\n\n')}\n`;
};
