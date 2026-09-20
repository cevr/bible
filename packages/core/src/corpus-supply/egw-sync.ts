/**
 * Mirror the remote EGW catalog into the local corpus.
 *
 * Lives in core rather than beside the CLI command because it has two callers
 * with nothing else in common: `bible egw sync` at a terminal, and the weekly
 * scheduled sync inside the deployed search server. Only the presentation
 * differs — the flags, the progress lines and the exit code are the CLI's; the
 * traversal, the failure classification and the report are the domain's.
 *
 * Depends on `EGWApiClient`, `EGWParagraphDatabase` and `CorpusSupply` from
 * context, so a caller supplies its own database connection. That is what lets
 * the server run this over the same `SqlClient` its search handlers read
 * through, rather than opening a second connection to the same file.
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

export interface EgwSyncOptions {
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

export interface EgwSyncReport {
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

export class EgwSyncInputError extends Schema.TaggedError<EgwSyncInputError>()(
  'EgwSyncInputError',
  { message: Schema.String },
) {}

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

export const syncEgwCorpus = Effect.fn('EgwSync.syncCorpus')(function* (options: EgwSyncOptions) {
  if (options.concurrency < 1) {
    return yield* EgwSyncInputError.make({ message: 'Concurrency must be at least 1.' });
  }

  const client = yield* EGWApiClient;
  const database = yield* EGWParagraphDatabase;
  const supply = yield* CorpusSupply;
  const [remoteCollection, localBefore] = yield* Effect.all([
    client.getBooks({ lang: options.lang }).pipe(Stream.runCollect),
    readBooks(database),
  ]);
  const remote = [...remoteCollection];
  const remoteIds = new Set(remote.map((book) => book.book_id));
  const localBeforeById = new Map(localBefore.map((book) => [book.book_id, book]));
  const installedBefore = remote.filter((book) =>
    hasContent(Option.fromNullishOr(localBeforeById.get(book.book_id))),
  );
  const pending = remote.filter((book) => {
    if (options.refresh) return true;
    return !hasContent(Option.fromNullishOr(localBeforeById.get(book.book_id)));
  });
  const completed = yield* Ref.make(0);

  const attempts = yield* Effect.forEach(
    pending,
    (book) =>
      Effect.gen(function* () {
        const result = yield* Effect.exit(
          supply.ensure({
            target: Target.writings([publicationId(book.book_id)]),
            refresh: options.refresh,
          }),
        );
        const done = yield* Ref.updateAndGet(completed, (value) => value + 1);
        if (Exit.isSuccess(result)) {
          yield* options.onProgress({
            completed: done,
            total: pending.length,
            id: book.book_id,
            code: book.code,
            status: 'installed',
          });
          return Option.none<EgwSyncFailure>();
        }

        if (Cause.hasInterrupts(result.cause)) return yield* Effect.failCause(result.cause);
        const message = messageFromCause(Cause.squash(result.cause));
        yield* database
          .setSyncStatus(book.book_id, book.code, 'failed', 0, message)
          .pipe(Effect.ignore);
        yield* options.onProgress({
          completed: done,
          total: pending.length,
          id: book.book_id,
          code: book.code,
          status: 'failed',
        });
        return Option.some<EgwSyncFailure>({
          id: book.book_id,
          code: book.code,
          title: book.title,
          error: message,
          expected: isKnownUnavailable(book.book_id),
        });
      }),
    { concurrency: options.concurrency },
  );

  const failures = attempts.flatMap((attempt) => Option.toArray(attempt));
  const localAfter = yield* readBooks(database);
  const localAfterById = new Map(localAfter.map((book) => [book.book_id, book]));
  // The known-unavailable books are absent from `missing` for the same reason
  // they are excluded from `unexpectedFailures`: "missing" should mean "we
  // expected this and do not have it", and these we do not expect.
  const missing = remote.flatMap((book) => {
    if (hasContent(Option.fromNullishOr(localAfterById.get(book.book_id)))) return [];
    if (isKnownUnavailable(book.book_id)) return [];
    return [{ id: book.book_id, code: book.code, title: book.title }];
  });
  // Counted from what the database actually holds, not as
  // `remote.length - missing.length`: `missing` now omits the known-unavailable
  // books, and deriving `present` from it would report those 18 as present.
  const present = remote.filter((book) =>
    hasContent(Option.fromNullishOr(localAfterById.get(book.book_id))),
  ).length;
  const localOnly = localAfter.filter((book) => !remoteIds.has(book.book_id)).length;

  return {
    remote: remote.length,
    installedBefore: installedBefore.length,
    attempted: pending.length,
    installed: pending.length - failures.length,
    failed: failures.length,
    unexpectedFailures: failures.filter((failure) => !failure.expected).length,
    present,
    missing,
    localOnly,
    failures,
  } satisfies EgwSyncReport;
});
