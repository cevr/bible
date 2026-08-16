import { EGWApiClient } from '@bible/core/egw';
import {
  EGWParagraphDatabase,
  type BookRow,
  type EGWParagraphDatabaseService,
} from '@bible/core/egw-db';
import { CorpusSupply, Target } from '@bible/core/corpus-supply';
import { publicationId } from '@bible/core/writings';
import { Cause, Console, Effect, Exit, Option, Predicate, Ref, Schema, Stream } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';

import { CliProcess } from '../../services/process.js';
import { encodeJson } from './format.js';
import { FullLayer } from './layers.js';

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
}

export interface EgwSyncReport {
  readonly remote: number;
  readonly installedBefore: number;
  readonly attempted: number;
  readonly installed: number;
  readonly failed: number;
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
        });
      }),
    { concurrency: options.concurrency },
  );

  const failures = attempts.flatMap((attempt) => Option.toArray(attempt));
  const localAfter = yield* readBooks(database);
  const localAfterById = new Map(localAfter.map((book) => [book.book_id, book]));
  const missing = remote.flatMap((book) => {
    if (hasContent(Option.fromNullishOr(localAfterById.get(book.book_id)))) return [];
    return [{ id: book.book_id, code: book.code, title: book.title }];
  });
  const present = remote.length - missing.length;
  const localOnly = localAfter.filter((book) => !remoteIds.has(book.book_id)).length;

  return {
    remote: remote.length,
    installedBefore: installedBefore.length,
    attempted: pending.length,
    installed: pending.length - failures.length,
    failed: failures.length,
    present,
    missing,
    localOnly,
    failures,
  } satisfies EgwSyncReport;
});

const syncLang = Flag.string('lang').pipe(
  Flag.withDescription('Language code (default: en)'),
  Flag.withDefault('en'),
);
const syncConcurrency = Flag.integer('concurrency').pipe(
  Flag.withAlias('c'),
  Flag.withDescription('Concurrent book downloads (default: 2)'),
  Flag.withDefault(2),
);
const syncRefresh = Flag.boolean('refresh').pipe(
  Flag.withDescription('Download every remote book again'),
  Flag.withDefault(false),
);
const syncJson = Flag.boolean('json').pipe(
  Flag.withDescription('Output the final report as JSON'),
  Flag.withDefault(false),
);

const progressLine = (progress: EgwSyncProgress): string => {
  let marker = 'failed';
  if (progress.status === 'installed') marker = 'stored';
  return `[${String(progress.completed)}/${String(progress.total)}] ${marker} ${progress.code} (id ${String(progress.id)})`;
};

export const egwSync = Command.make(
  'sync',
  {
    lang: syncLang,
    concurrency: syncConcurrency,
    refresh: syncRefresh,
    json: syncJson,
  },
  (args) =>
    Effect.gen(function* () {
      const report = yield* syncEgwCorpus({
        lang: args.lang,
        concurrency: args.concurrency,
        refresh: args.refresh,
        onProgress: (progress) => Console.error(progressLine(progress)),
      });

      if (args.json) {
        yield* Console.log(yield* encodeJson(report));
      } else {
        yield* Console.log(`Remote books: ${String(report.remote)}`);
        yield* Console.log(`Present before: ${String(report.installedBefore)}`);
        yield* Console.log(`Attempted: ${String(report.attempted)}`);
        yield* Console.log(`Installed: ${String(report.installed)}`);
        yield* Console.log(`Present now: ${String(report.present)}`);
        yield* Console.log(`Missing: ${String(report.missing.length)}`);
        yield* Console.log(`Local-only books kept: ${String(report.localOnly)}`);
        for (const failure of report.failures) {
          yield* Console.error(
            `Failed ${failure.code} (id ${String(failure.id)}): ${failure.error}`,
          );
        }
      }

      if (report.missing.length > 0) {
        const cliProcess = yield* CliProcess;
        return yield* cliProcess.exitFailure;
      }
    }),
).pipe(
  Command.withDescription('Mirror the remote EGW catalog into the local corpus'),
  Command.provide(() => FullLayer),
);
