/**
 * The mail a corpus sync sends its owner when it ends.
 *
 * A Workflow's report lives in the dashboard, where nobody looks on a Sunday.
 * So the run mails what it did: the books it added, the books the library
 * updated and the first of the paragraphs that changed with them (edits word
 * by word), and what failed. The subject alone says whether anything needs a
 * look, so a quiet week can stay unread. Everything past the mail's caps is
 * in the full report it links to (`./sync-report.ts`).
 *
 * This module only words the mail; `Sync.ts` sends it.
 */

import { Array as Arr, Data, Option } from 'effect';

import { type EgwSyncBook, isKnownUnavailable } from '@bible/core/corpus-supply';

import {
  type BookChange,
  changeCount,
  changeLabel,
  changeSummary,
  type SyncRun,
  withheldReasons,
} from './sync-report.ts';
import { type DiffSegment, wordDiff } from './word-diff.ts';

/** The most books and changes a mail lists; the report has the rest. */
export const MAIL_LIMIT = 20;

/** Words of unchanged text kept on each side of an edit. */
const CONTEXT_WORDS = 12;

/** How a run ended. */
export type SyncOutcome = Data.TaggedEnum<{
  /** A plan-only run: what a sync would do, with nothing written. */
  Planned: {
    readonly remote: number;
    readonly installedBefore: number;
    readonly pending: readonly EgwSyncBook[];
    readonly changed: readonly EgwSyncBook[];
    readonly verify: number;
    readonly recheckLeft: number;
  };
  /** A sync that ran to its report. */
  Synced: {
    readonly run: SyncRun;
    /** The first changes the library's updates made, at most `MAIL_LIMIT`. */
    readonly excerpt: readonly BookChange[];
    /** How many changes the updates made in all. */
    readonly updateChanges: number;
    /** Where the full report is, when this stage publishes one. */
    readonly report: Option.Option<string>;
  };
  /** A run that stopped before its report. */
  Stopped: { readonly reason: string };
}>;
export const SyncOutcome = Data.taggedEnum<SyncOutcome>();

export interface SyncMail {
  readonly subject: string;
  readonly text: string;
}

const PREFIX = 'EGW sync';

const bookLine = (book: EgwSyncBook) => `- ${book.code}: ${book.title}`;

/** A titled list, or nothing when the list is empty. */
const section = (title: string, lines: readonly string[]): readonly string[] =>
  Arr.match(lines, { onEmpty: () => [], onNonEmpty: (some) => ['', title, ...some] });

/** At most `MAIL_LIMIT` lines, and a line saying where the rest are. */
const capped = (lines: readonly string[]): readonly string[] => {
  const rest = lines.length - MAIL_LIMIT;
  if (rest <= 0) return lines;
  return [...lines.slice(0, MAIL_LIMIT), `- and ${String(rest)} more in the full report`];
};

/** Unchanged text cut to the words next to an edit. */
const context = (text: string, at: 'start' | 'middle' | 'end'): string => {
  const words = text.split(' ');
  if (words.length <= CONTEXT_WORDS * 2) return text;
  const head = words.slice(0, CONTEXT_WORDS).join(' ');
  const tail = words.slice(-CONTEXT_WORDS).join(' ');
  if (at === 'start') return `… ${tail}`;
  if (at === 'end') return `${head} …`;
  return `${head} … ${tail}`;
};

/** An edit as git's word diff writes it: `[-removed-]{+added+}`. */
const editLine = (segments: readonly DiffSegment[]): string =>
  segments
    .map((segment, index) => {
      if (segment.kind === 'removed') return `[-${segment.text}-]`;
      if (segment.kind === 'added') return `{+${segment.text}+}`;
      let at: 'start' | 'middle' | 'end' = 'middle';
      if (index === 0) at = 'start';
      if (index === segments.length - 1) at = 'end';
      return context(segment.text, at);
    })
    .join(' ');

const changeLines = ({ book, change }: BookChange): readonly string[] => {
  const before = change.before_text ?? '';
  const after = change.after_text ?? '';
  let body = `{+${after}+}`;
  if (change.kind === 'edited') body = editLine(wordDiff(before, after));
  if (change.kind === 'removed') body = `[-${before}-]`;
  return ['', `${changeLabel(book, change)}, ${change.kind}`, `  ${body}`];
};

const synced = (outcome: Extract<SyncOutcome, { _tag: 'Synced' }>): SyncMail => {
  const { run, excerpt, updateChanges, report } = outcome;
  const { counts } = run;
  const unexpected = counts.failures.filter((failure) => !failure.expected);
  const expected = counts.failures.filter((failure) => failure.expected);
  const updated = run.updated.filter(({ changes }) => changeCount(changes) > 0);
  const corrected = run.verified.filter(({ changes }) => changeCount(changes) > 0);
  const correctedParagraphs = corrected.reduce((sum, { changes }) => sum + changeCount(changes), 0);

  let subject = `${PREFIX}: no changes`;
  if (run.added.length + updated.length > 0) {
    subject = `${PREFIX}: ${String(run.added.length)} added, ${String(updated.length)} updated`;
  }
  if (unexpected.length + run.vectorFailures.length > 0) {
    subject =
      `${PREFIX}: needs a look (${String(unexpected.length)} failed, ` +
      `${String(run.vectorFailures.length)} without vectors)`;
  }

  const verifiedLine = Arr.match(run.verified, {
    onEmpty: (): readonly string[] => [],
    onNonEmpty: (books) => [
      '',
      `Checked ${String(books.length)} older books against the library: ` +
        `${String(corrected.length)} gained paragraphs the earlier import missed ` +
        `(${String(correctedParagraphs)} in all). ${String(run.recheckLeft)} left to check.`,
    ],
  });
  const text = [
    `The library lists ${String(counts.remote)} books. The corpus holds ${String(counts.present)}; ` +
      `it held ${String(counts.installedBefore)} before this run.`,
    ...section(`Added (${String(run.added.length)}):`, capped(run.added.map(bookLine))),
    ...section(
      `Updated by the library (${String(run.updated.length)}):`,
      capped(
        run.updated.map(
          ({ book, changes }) => `- ${book.code}: ${book.title} (${changeSummary(changes)})`,
        ),
      ),
    ),
    ...section(
      `Changes (${String(excerpt.length)} of ${String(updateChanges)}):`,
      excerpt.flatMap(changeLines).slice(1),
    ),
    ...verifiedLine,
    ...section(
      `Failed unexpectedly (${String(unexpected.length)}):`,
      unexpected.map((failure) => `- ${failure.code}: ${failure.title} (${failure.error})`),
    ),
    ...section(
      `Installed without vectors (${String(run.vectorFailures.length)}), fixed by a reembed run:`,
      run.vectorFailures.map((failed) => `- book ${String(failed.id)}: ${failed.reason}`),
    ),
    '',
    `Withheld by the library, as expected: ${String(expected.length)} ` +
      `(${withheldReasons(expected.map((failure) => failure.id))}).`,
    ...Option.match(report, {
      onNone: (): readonly string[] => [],
      onSome: (url) => ['', `Full report: ${url}`],
    }),
  ];
  return { subject, text: text.join('\n') };
};

const planned = (plan: {
  readonly remote: number;
  readonly installedBefore: number;
  readonly toAdd: readonly EgwSyncBook[];
  readonly withheld: readonly EgwSyncBook[];
  readonly changed: readonly EgwSyncBook[];
  readonly verify: number;
  readonly recheckLeft: number;
}): SyncMail => ({
  subject: `${PREFIX} plan: ${String(plan.toAdd.length)} to add, ${String(plan.changed.length)} updated`,
  text: [
    'A plan-only run: nothing was written.',
    `The library lists ${String(plan.remote)} books; the corpus held ${String(plan.installedBefore)}.`,
    ...section(
      `A sync would add (${String(plan.toAdd.length)}):`,
      capped(plan.toAdd.map(bookLine)),
    ),
    ...section(
      `Updated by the library (${String(plan.changed.length)}):`,
      capped(plan.changed.map(bookLine)),
    ),
    '',
    `It would check ${String(plan.verify)} older books against the library, ` +
      `and leave ${String(plan.recheckLeft)} for later runs.`,
    `It would try again the ${String(plan.withheld.length)} books the library lists but withholds ` +
      `(${withheldReasons(plan.withheld.map((book) => book.id))}).`,
  ].join('\n'),
});

/** The mail for a run's outcome. */
export const syncMail: (outcome: SyncOutcome) => SyncMail = SyncOutcome.$match({
  Planned: ({ remote, installedBefore, pending, changed, verify, recheckLeft }) => {
    // The library lists some books it never serves; a sync tries them again
    // and they fail as expected, so they are not books to add.
    const withheld = pending.filter((book) => isKnownUnavailable(book.id));
    const toAdd = pending.filter((book) => !isKnownUnavailable(book.id));
    return planned({ remote, installedBefore, toAdd, withheld, changed, verify, recheckLeft });
  },
  Synced: synced,
  Stopped: ({ reason }) => ({
    subject: `${PREFIX}: stopped before its report`,
    text: [
      'The run stopped before it finished. What it installed before that stays installed;',
      'the next run picks up the rest.',
      '',
      reason,
    ].join('\n'),
  }),
});
