/**
 * Mirror the remote EGW catalog into the local corpus.
 *
 * Lives in core rather than beside the CLI command because it has two callers
 * with nothing else in common: `bible egw sync` at a terminal, and the weekly
 * Workflow beside the deployed search Worker. Only the presentation differs —
 * the flags, the progress lines and the exit code are the CLI's; the
 * traversal, the failure classification and the report are the domain's.
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
}

export interface EgwSyncPlan {
  readonly remote: readonly EgwSyncBook[];
  /** Remote books the database held content for before the sync. */
  readonly installedBefore: number;
  /** The books this sync installs, in catalog order. */
  readonly pending: readonly EgwSyncBook[];
}

/** One book's install: done, or failed with the reason recorded. */
export type EgwBookOutcome =
  | { readonly _tag: 'Installed'; readonly book: EgwSyncBook }
  | { readonly _tag: 'Failed'; readonly failure: EgwSyncFailure };

/** The failure an outcome carries, when the install failed. */
export const failureOf = (outcome: EgwBookOutcome): Option.Option<EgwSyncFailure> => {
  if (outcome._tag === 'Failed') return Option.some(outcome.failure);
  return Option.none();
};

/** The remote catalog against the database: what is there, and what to install.
 *  `refresh` installs every remote book; otherwise only those without content. */
export const planEgwSync = Effect.fn('EgwSync.plan')(function* (options: {
  readonly lang: string;
  readonly refresh: boolean;
}) {
  const client = yield* EGWApiClient;
  const database = yield* EGWParagraphDatabase;
  const [remoteCollection, localBefore] = yield* Effect.all([
    client.getBooks({ lang: options.lang }).pipe(Stream.runCollect),
    readBooks(database),
  ]);
  const remote = [...remoteCollection].map((book): EgwSyncBook => ({
    id: book.book_id,
    code: book.code,
    title: book.title,
  }));
  const localBeforeById = new Map(localBefore.map((book) => [book.book_id, book]));
  const installed = (book: EgwSyncBook) =>
    hasContent(Option.fromNullishOr(localBeforeById.get(book.id)));
  return {
    remote,
    installedBefore: remote.filter(installed).length,
    pending: remote.filter((book) => options.refresh || !installed(book)),
  } satisfies EgwSyncPlan;
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
    const installed: EgwBookOutcome = { _tag: 'Installed', book };
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

  return {
    remote: plan.remote.length,
    installedBefore: plan.installedBefore,
    attempted: plan.pending.length,
    installed: plan.pending.length - failures.length,
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
  const completed = yield* Ref.make(0);
  const outcomes = yield* Effect.forEach(
    plan.pending,
    (book) =>
      Effect.gen(function* () {
        const outcome = yield* installEgwBook(book, options);
        const done = yield* Ref.updateAndGet(completed, (value) => value + 1);
        yield* options.onProgress({
          completed: done,
          total: plan.pending.length,
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
