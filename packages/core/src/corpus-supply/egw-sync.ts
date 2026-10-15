/**
 * Mirror the remote EGW catalog into the local corpus.
 *
 * Lives in core rather than beside the CLI command because it has two callers
 * with nothing else in common: `bible egw sync` at a terminal, and the weekly
 * Workflow beside the deployed search Worker. Only the presentation differs —
 * the flags, the progress lines and the exit code are the CLI's; the
 * traversal, the failure classification and the report are the domain's.
 *
 * A sync installs the books the corpus lacks, and rechecks the books it has
 * whose revision moved (`./egw-revision.ts`): each is downloaded again, and
 * the install records which paragraphs it changed (`paragraph_changes`).
 * Rechecks are capped per run, so a catalog that moves every book at once is
 * worked through over several runs rather than in one.
 *
 * The sync is three parts — `planEgwSync`, `installEgwBook` per book, and
 * `reportEgwSync` — because the two callers run them differently. The CLI
 * runs them in one process (`syncEgwCorpus`). The Workflow runs each as a
 * durable step, so an install that fails is retried on its own and a run
 * that is evicted resumes at the book it reached rather than from the start.
 *
 * Depends on `EGWApiClient`, `EGWParagraphDatabase` and `CorpusSupply` from
 * context, so a caller supplies its own database connection.
 */

import { Cause, Effect, Exit, Option, Predicate, Ref, Schema, Stream } from 'effect';

import { EGWApiClient } from '../egw/index.js';
import {
  EGWParagraphDatabase,
  type BookRow,
  type EGWParagraphDatabaseService,
} from '../egw-db/index.js';
import { publicationId } from '../writings/model.js';
import { CorpusSupply } from './service.js';
import { Target } from './model.js';
import { egwBookRevision, isContentRevision } from './egw-revision.js';
import { isKnownUnavailable } from './unavailable.js';

export interface EgwSyncProgress {
  readonly completed: number;
  readonly total: number;
  readonly id: number;
  readonly code: string;
  readonly status: 'installed' | 'failed';
}

interface EgwSyncOptions {
  readonly lang: string;
  readonly concurrency: number;
  readonly refresh: boolean;
  /** Installed books whose revision moved to download again this run. */
  readonly recheckLimit: number;
  readonly onProgress: (progress: EgwSyncProgress) => Effect.Effect<void>;
}

export interface EgwSyncFailure {
  readonly id: number;
  readonly code: string;
  readonly title: string;
  readonly error: string;
  /** True when the library is known to withhold this book's content, so the
   *  failure is the documented outcome rather than news. See
   *  `KNOWN_UNAVAILABLE`. */
  readonly expected: boolean;
}

interface EgwSyncReport {
  readonly remote: number;
  readonly installedBefore: number;
  /** Installed books downloaded again because their revision moved. */
  readonly rechecked: number;
  /** Installed books whose revision moved, left for a later run. */
  readonly recheckLeft: number;
  readonly attempted: number;
  readonly installed: number;
  readonly failed: number;
  /** `failed` minus the known-unavailable books. This is the number a weekly
   *  report should alarm on: `failed` is never zero and never will be, so a
   *  monitor watching it would fire every week and be ignored by the second
   *  week. */
  readonly unexpectedFailures: number;
  readonly present: number;
  readonly missing: readonly {
    readonly id: number;
    readonly code: string;
    readonly title: string;
  }[];
  readonly localOnly: number;
  readonly failures: readonly EgwSyncFailure[];
}

class EgwSyncInputError extends Schema.TaggedError<EgwSyncInputError>()('EgwSyncInputError', {
  message: Schema.String,
}) {}

const hasContent = (book: Option.Option<BookRow>): boolean =>
  Option.exists(book, (value) => value.paragraph_count > 0);

const messageFromCause = (cause: unknown): string => {
  if (Predicate.isString(cause) && cause.length > 0) return cause;
  if (
    Predicate.hasProperty(cause, 'message') &&
    Predicate.isString(cause.message) &&
    cause.message.length > 0
  ) {
    return cause.message;
  }
  if (Predicate.hasProperty(cause, '_tag') && Predicate.isString(cause._tag)) {
    return cause._tag;
  }
  return 'The download failed without a message.';
};

const readBooks = (database: EGWParagraphDatabaseService) =>
  Stream.runCollect(database.getAllBooks).pipe(Effect.map((books) => [...books]));

/** A book of the remote catalog, as much of it as a sync carries between its
 *  steps. Plain data, so a durable host (the Worker's Workflow) can persist
 *  it as a step result. */
export interface EgwSyncBook {
  readonly id: number;
  readonly code: string;
  readonly title: string;
  /** The catalog's revision of the book (`egwBookRevision`). */
  readonly revision: string;
}

export interface EgwSyncPlan {
  readonly remote: readonly EgwSyncBook[];
  /** Remote books the database held content for before the sync. */
  readonly installedBefore: number;
  /** The books this sync installs, in catalog order. */
  readonly pending: readonly EgwSyncBook[];
  /** Installed books whose content hash moved: the library changed them.
   *  Downloaded again first. */
  readonly changed: readonly EgwSyncBook[];
  /** Installed books recorded before revisions were content hashes, so their
   *  text was never checked against the library's: downloaded again after
   *  `changed`, within the run's limit. What differs is the older import's
   *  gap, not the library's change. */
  readonly verify: readonly EgwSyncBook[];
  /** Books to recheck beyond this sync's limit, left for a later run. */
  readonly recheckLeft: number;
}

/** What an install changed in a book that was already there. All zero for a
 *  first install, and for a recheck that found the same text. */
export interface EgwParagraphChangeCounts {
  readonly added: number;
  readonly removed: number;
  readonly edited: number;
}

/** One book's install: done, or failed with the reason recorded. */
export type EgwBookOutcome =
  | {
      readonly _tag: 'Installed';
      readonly book: EgwSyncBook;
      readonly changes: EgwParagraphChangeCounts;
    }
  | { readonly _tag: 'Failed'; readonly failure: EgwSyncFailure };

/** The failure an outcome carries, when the install failed. */
export const failureOf = (outcome: EgwBookOutcome): Option.Option<EgwSyncFailure> => {
  if (outcome._tag === 'Failed') return Option.some(outcome.failure);
  return Option.none();
};

/** The remote catalog against the database: what is there, and what to install.
 *  `refresh` installs every remote book; otherwise those without content, and
 *  up to `recheckLimit` installed books whose revision moved. */
export const planEgwSync = Effect.fn('EgwSync.plan')(function* (options: {
  readonly lang: string;
  readonly refresh: boolean;
  readonly recheckLimit: number;
}) {
  const client = yield* EGWApiClient;
  const database = yield* EGWParagraphDatabase;
  const [remoteCollection, localBefore, statuses] = yield* Effect.all([
    client.getBooks({ lang: options.lang }).pipe(Stream.runCollect),
    readBooks(database),
    database.getAllSyncStatus,
  ]);
  const remote = [...remoteCollection].map((book): EgwSyncBook => ({
    id: book.book_id,
    code: book.code,
    title: book.title,
    revision: egwBookRevision(book),
  }));
  const localBeforeById = new Map(localBefore.map((book) => [book.book_id, book]));
  const installed = (book: EgwSyncBook) =>
    hasContent(Option.fromNullishOr(localBeforeById.get(book.id)));
  if (options.refresh) {
    return {
      remote,
      installedBefore: remote.filter(installed).length,
      pending: remote,
      changed: [],
      verify: [],
      recheckLeft: 0,
    } satisfies EgwSyncPlan;
  }

  const recorded = new Map(
    statuses.flatMap((row) =>
      Option.toArray(
        Option.map(
          Option.filter(Option.fromNullishOr(row.revision), () => row.status === 'success'),
          (revision) => [row.book_id, revision] as const,
        ),
      ),
    ),
  );
  const recordedOf = (book: EgwSyncBook) => Option.fromNullishOr(recorded.get(book.id));
  const moved = remote.filter(
    (book) => installed(book) && !Option.contains(recordedOf(book), book.revision),
  );
  // A content hash that moved is news; a book recorded before revisions were
  // content hashes is only unverified, so it waits behind them.
  const hashMoved = (book: EgwSyncBook) => Option.exists(recordedOf(book), isContentRevision);
  const limit = Math.max(0, options.recheckLimit);
  const changed = moved.filter(hashMoved).slice(0, limit);
  const verify = moved.filter((book) => !hashMoved(book)).slice(0, limit - changed.length);
  return {
    remote,
    installedBefore: remote.filter(installed).length,
    pending: remote.filter((book) => !installed(book)),
    changed,
    verify,
    recheckLeft: moved.length - changed.length - verify.length,
  } satisfies EgwSyncPlan;
});

const NO_CHANGES: EgwParagraphChangeCounts = { added: 0, removed: 0, edited: 0 };

/** The paragraphs the install of a book's recorded revision changed. Read
 *  by the revision rather than taken from the install, so a retried step
 *  that finds the book current still sees the changes its first attempt
 *  made. */
export const latestParagraphChanges = Effect.fn('EgwSync.latestChanges')(function* (
  bookId: number,
) {
  const database = yield* EGWParagraphDatabase;
  const status = yield* database.getSyncStatus(bookId);
  const revision = Option.flatMap(status, (row) => Option.fromNullishOr(row.revision));
  if (Option.isNone(revision)) return [];
  return yield* database.paragraphChanges(bookId, revision.value);
});

const changesOf = Effect.fn('EgwSync.changesOf')(function* (bookId: number) {
  const rows = yield* latestParagraphChanges(bookId);
  if (rows.length === 0) return NO_CHANGES;
  const count = (kind: string) => rows.filter((row) => row.kind === kind).length;
  return { added: count('added'), removed: count('removed'), edited: count('edited') };
});

/** Install one book. A failure is an outcome, not an error: it is recorded
 *  in `sync_status` and returned, so one book never stops the rest. Only an
 *  interruption propagates. */
export const installEgwBook = Effect.fn('EgwSync.installBook')(function* (
  book: EgwSyncBook,
  options: { readonly refresh: boolean },
) {
  const database = yield* EGWParagraphDatabase;
  const supply = yield* CorpusSupply;
  const result = yield* Effect.exit(
    supply.ensure({
      target: Target.writings([publicationId(book.id)]),
      refresh: options.refresh,
    }),
  );
  if (Exit.isSuccess(result)) {
    const changes = yield* changesOf(book.id);
    const installed: EgwBookOutcome = { _tag: 'Installed', book, changes };
    return installed;
  }
  if (Cause.hasInterrupts(result.cause)) return yield* Effect.failCause(result.cause);
  const message = messageFromCause(Cause.squash(result.cause));
  yield* database.setSyncStatus(book.id, book.code, 'failed', 0, message).pipe(Effect.ignore);
  const failed: EgwBookOutcome = {
    _tag: 'Failed',
    failure: {
      id: book.id,
      code: book.code,
      title: book.title,
      error: message,
      expected: isKnownUnavailable(book.id),
    },
  };
  return failed;
});

/** The report of a sync: the plan, the failures among its installs, and the
 *  database as it stands after them. */
export const reportEgwSync = Effect.fn('EgwSync.report')(function* (
  plan: EgwSyncPlan,
  failures: readonly EgwSyncFailure[],
) {
  const database = yield* EGWParagraphDatabase;
  const localAfter = yield* readBooks(database);
  const localAfterById = new Map(localAfter.map((book) => [book.book_id, book]));
  const remoteIds = new Set(plan.remote.map((book) => book.id));
  const present = (book: EgwSyncBook) =>
    hasContent(Option.fromNullishOr(localAfterById.get(book.id)));
  // The known-unavailable books are absent from `missing` for the same reason
  // they are excluded from `unexpectedFailures`: "missing" should mean "we
  // expected this and do not have it", and these we do not expect.
  const missing = plan.remote.filter((book) => !present(book) && !isKnownUnavailable(book.id));

  const attempted = plan.pending.length + plan.changed.length + plan.verify.length;
  return {
    remote: plan.remote.length,
    installedBefore: plan.installedBefore,
    rechecked: plan.changed.length + plan.verify.length,
    recheckLeft: plan.recheckLeft,
    attempted,
    installed: attempted - failures.length,
    failed: failures.length,
    unexpectedFailures: failures.filter((failure) => !failure.expected).length,
    // Counted from what the database actually holds, not as
    // `remote.length - missing.length`: `missing` omits the known-unavailable
    // books, and deriving `present` from it would report those as present.
    present: plan.remote.filter(present).length,
    missing,
    localOnly: localAfter.filter((book) => !remoteIds.has(book.book_id)).length,
    failures,
  } satisfies EgwSyncReport;
});

export const syncEgwCorpus = Effect.fn('EgwSync.syncCorpus')(function* (options: EgwSyncOptions) {
  if (options.concurrency < 1) {
    return yield* EgwSyncInputError.make({ message: 'Concurrency must be at least 1.' });
  }

  const plan = yield* planEgwSync(options);
  const books = [...plan.pending, ...plan.changed, ...plan.verify];
  const completed = yield* Ref.make(0);
  const outcomes = yield* Effect.forEach(
    books,
    (book) =>
      Effect.gen(function* () {
        const outcome = yield* installEgwBook(book, options);
        const done = yield* Ref.updateAndGet(completed, (value) => value + 1);
        yield* options.onProgress({
          completed: done,
          total: books.length,
          id: book.id,
          code: book.code,
          status: Option.match(failureOf(outcome), {
            onNone: () => 'installed' as const,
            onSome: () => 'failed' as const,
          }),
        });
        return outcome;
      }),
    { concurrency: options.concurrency },
  );

  return yield* reportEgwSync(
    plan,
    outcomes.flatMap((outcome) => Option.toArray(failureOf(outcome))),
  );
});
