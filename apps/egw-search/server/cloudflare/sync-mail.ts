/**
 * The mail a corpus sync sends its owner when it ends.
 *
 * A Workflow's report lives in the dashboard, where nobody looks on a Sunday.
 * So the run mails what it did: the books it installed, what failed and
 * whether that failure was expected, and a run that stopped partway. The
 * subject alone says whether anything needs a look, so a quiet week can stay
 * unread.
 *
 * This module only words the mail; `Sync.ts` sends it.
 */

import { Array as Arr, Data } from 'effect';

import type { EgwSyncBook, EgwSyncFailure } from '@bible/core/corpus-supply';

/** The parts of the sync's report the mail reads. */
interface SyncCounts {
  readonly remote: number;
  readonly installedBefore: number;
  readonly unexpectedFailures: number;
  readonly present: number;
  readonly failures: readonly EgwSyncFailure[];
}

/** A book whose vectors failed after it was installed. */
interface VectorFailure {
  readonly id: number;
  readonly reason: string;
}

/** How a run ended. */
export type SyncOutcome = Data.TaggedEnum<{
  /** A plan-only run: what a sync would install, with nothing written. */
  Planned: {
    readonly remote: number;
    readonly installedBefore: number;
    readonly pending: readonly EgwSyncBook[];
  };
  /** A sync that ran to its report. */
  Synced: {
    readonly counts: SyncCounts;
    readonly installed: readonly EgwSyncBook[];
    readonly vectorFailures: readonly VectorFailure[];
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

const failureLine = (failure: EgwSyncFailure) =>
  `- ${failure.code}: ${failure.title} (${failure.error})`;

/** A titled list, or nothing when the list is empty. */
const section = (title: string, lines: readonly string[]): readonly string[] =>
  Arr.match(lines, { onEmpty: () => [], onNonEmpty: (some) => ['', title, ...some] });

const synced = (outcome: Extract<SyncOutcome, { _tag: 'Synced' }>): SyncMail => {
  const { counts, installed, vectorFailures } = outcome;
  const unexpected = counts.failures.filter((failure) => !failure.expected);
  const expected = counts.failures.length - unexpected.length;
  let subject = `${PREFIX}: ${String(installed.length)} installed`;
  if (unexpected.length + vectorFailures.length > 0) {
    subject =
      `${PREFIX}: needs a look (${String(unexpected.length)} failed, ` +
      `${String(vectorFailures.length)} without vectors)`;
  }
  const text = [
    `The library lists ${String(counts.remote)} books. ${String(counts.present)} are in the corpus now; ` +
      `${String(counts.installedBefore)} were before this run.`,
    ...section(`Installed (${String(installed.length)}):`, installed.map(bookLine)),
    ...section(`Failed unexpectedly (${String(unexpected.length)}):`, unexpected.map(failureLine)),
    ...section(
      `Installed without vectors (${String(vectorFailures.length)}), fixed by a reembed run:`,
      vectorFailures.map((failed) => `- book ${String(failed.id)}: ${failed.reason}`),
    ),
    '',
    `${String(expected)} books the library lists but does not serve failed as expected.`,
  ];
  return { subject, text: text.join('\n') };
};

/** The mail for a run's outcome. */
export const syncMail: (outcome: SyncOutcome) => SyncMail = SyncOutcome.$match({
  Planned: ({ remote, installedBefore, pending }) => ({
    subject: `${PREFIX} plan: ${String(pending.length)} to install`,
    text: [
      `A plan-only run: nothing was written.`,
      `The library lists ${String(remote)} books; the corpus held ${String(installedBefore)}.`,
      ...section(`A sync would try (${String(pending.length)}):`, pending.map(bookLine)),
    ].join('\n'),
  }),
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
