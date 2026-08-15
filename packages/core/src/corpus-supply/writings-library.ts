import { Effect, Layer, Option, Predicate, Result, Stream } from 'effect';

import { EGWParagraphDatabase, type BookRow, type SyncStatusRow } from '../egw-db/book-database.js';
import { ProcedureError } from '../procedure/model.js';
import { WritingsLibraryRuntime } from '../procedure/services.js';
import {
  type Publication,
  type PublicationId,
  WritingsDownloadResult,
  WritingsLibraryPublication,
  publicationCode,
  publicationId,
} from '../writings/model.js';
import { Target } from './model.js';
import { CorpusSupply } from './service.js';
import { WritingsAssetRecipe } from './source.js';

const failure = (procedure: string, cause: unknown) => {
  let message = String(cause);
  if (Predicate.isObject(cause) && Predicate.isNotUndefined(cause['message'])) {
    message = String(cause['message']);
  }
  return ProcedureError.make({
    procedure,
    code: 'WritingsLibraryFailure',
    message,
  });
};

const statusFor = (
  paragraphCount: Option.Option<number>,
  sync: Option.Option<SyncStatusRow>,
): 'pending' | 'success' | 'failed' => {
  if (Option.isSome(paragraphCount) && paragraphCount.value > 0) return 'success';
  if (Option.isSome(sync) && sync.value.status === 'failed') return 'failed';
  return 'pending';
};

const sourceFor = (
  status: 'pending' | 'success' | 'failed',
  missing: 'remote' | 'empty',
): 'local' | 'remote' | 'empty' => {
  if (status === 'success') return 'local';
  return missing;
};

const syncError = (sync: Option.Option<SyncStatusRow>) =>
  Option.getOrNull(sync.pipe(Option.flatMap((row) => Option.fromNullishOr(row.error_message))));

const localEntry = (
  book: BookRow,
  sync: Option.Option<SyncStatusRow>,
): WritingsLibraryPublication => {
  const status = statusFor(Option.fromNullishOr(book.paragraph_count), sync);
  return WritingsLibraryPublication.make({
    id: publicationId(book.book_id),
    code: publicationCode(book.book_code),
    title: book.book_title,
    author: book.book_author,
    paragraphCount: book.paragraph_count,
    source: sourceFor(status, 'empty'),
    status,
    error: syncError(sync),
  });
};

const remoteEntry = (
  publication: Publication,
  local: Option.Option<BookRow>,
  sync: Option.Option<SyncStatusRow>,
): WritingsLibraryPublication => {
  const localCount = local.pipe(
    Option.flatMap((book) => Option.fromNullishOr(book.paragraph_count)),
  );
  const status = statusFor(localCount, sync);
  let paragraphCount = Option.getOrElse(publication.paragraphCount, () => 0);
  if (Option.isSome(sync)) paragraphCount = sync.value.paragraph_count;
  if (Option.isSome(localCount)) paragraphCount = localCount.value;
  return WritingsLibraryPublication.make({
    id: publication.id,
    code: publication.code,
    title: local.pipe(
      Option.map((book) => book.book_title),
      Option.getOrElse(() => publication.title),
    ),
    author: local.pipe(
      Option.map((book) => book.book_author),
      Option.getOrElse(() => publication.author),
    ),
    paragraphCount,
    source: sourceFor(status, 'remote'),
    status,
    error: syncError(sync),
  });
};

const statusEntry = (sync: SyncStatusRow): WritingsLibraryPublication => {
  const status = statusFor(Option.none(), Option.some(sync));
  return WritingsLibraryPublication.make({
    id: publicationId(sync.book_id),
    code: publicationCode(sync.book_code),
    title: sync.book_code,
    author: 'Unknown author',
    paragraphCount: sync.paragraph_count,
    source: sourceFor(status, 'empty'),
    status,
    error: sync.error_message,
  });
};

const resultFor = (publication: WritingsLibraryPublication) =>
  WritingsDownloadResult.make({
    publicationId: publication.id,
    code: publication.code,
    status: publication.status,
    paragraphCount: publication.paragraphCount,
    error: publication.error,
  });

export const layerWritingsLibraryRuntime: Layer.Layer<
  WritingsLibraryRuntime,
  never,
  WritingsAssetRecipe | EGWParagraphDatabase | CorpusSupply
> = Layer.effect(
  WritingsLibraryRuntime,
  Effect.gen(function* () {
    const source = yield* WritingsAssetRecipe;
    const database = yield* EGWParagraphDatabase;
    const supply = yield* CorpusSupply;

    const get = Effect.gen(function* () {
      const [remoteResult, localResult, statusResult] = yield* Effect.all([
        Effect.result(source.catalog),
        Effect.result(Stream.runCollect(database.getAllBooks)),
        Effect.result(database.getAllSyncStatus),
      ]);
      const hasLocal = Result.isSuccess(localResult) && localResult.success.length > 0;
      const hasStatus = Result.isSuccess(statusResult) && statusResult.success.length > 0;
      if (Result.isFailure(remoteResult) && !hasLocal && !hasStatus) {
        return yield* failure('v1.reading.writingsLibrary.get', remoteResult.failure);
      }

      let remote: readonly Publication[] = [];
      if (Result.isSuccess(remoteResult)) remote = remoteResult.success;
      let local: readonly BookRow[] = [];
      if (Result.isSuccess(localResult)) local = localResult.success;
      let statuses: readonly SyncStatusRow[] = [];
      if (Result.isSuccess(statusResult)) statuses = statusResult.success;

      const entries: WritingsLibraryPublication[] = [];
      for (const publication of remote) {
        const installed = Option.fromNullishOr(
          local.find((book) => book.book_id === publication.id),
        );
        const sync = Option.fromNullishOr(statuses.find((row) => row.book_id === publication.id));
        entries.push(remoteEntry(publication, installed, sync));
      }
      for (const book of local) {
        if (entries.some((entry) => entry.id === book.book_id)) continue;
        const sync = Option.fromNullishOr(statuses.find((row) => row.book_id === book.book_id));
        entries.push(localEntry(book, sync));
      }
      for (const sync of statuses) {
        if (sync.book_id <= 0) continue;
        if (entries.some((entry) => entry.id === sync.book_id)) continue;
        entries.push(statusEntry(sync));
      }
      return entries;
    }).pipe(Effect.mapError((cause) => failure('v1.reading.writingsLibrary.get', cause)));

    const download = (id: PublicationId) =>
      Effect.gen(function* () {
        yield* supply.ensure({ target: Target.writings([id]), refresh: true });
        const entries = yield* get;
        const publication = Option.fromNullishOr(entries.find((entry) => entry.id === id));
        if (Option.isNone(publication)) {
          return yield* failure(
            'v1.reading.writingsPublication.download',
            `Missing publication ${id}`,
          );
        }
        return resultFor(publication.value);
      }).pipe(
        Effect.mapError((cause) => failure('v1.reading.writingsPublication.download', cause)),
      );

    const downloadAll = Effect.gen(function* () {
      const entries = yield* get;
      const pending = entries.filter((entry) => entry.status !== 'success');
      if (pending.length === 0) return [];
      yield* supply.ensure({
        target: Target.writings(pending.map((entry) => entry.id)),
        refresh: true,
      });
      const refreshed = yield* get;
      return pending.flatMap((entry) => {
        const publication = Option.fromNullishOr(
          refreshed.find((candidate) => candidate.id === entry.id),
        );
        if (Option.isNone(publication)) return [];
        return [resultFor(publication.value)];
      });
    }).pipe(Effect.mapError((cause) => failure('v1.reading.writingsLibrary.downloadAll', cause)));

    return WritingsLibraryRuntime.of({ get, download, downloadAll });
  }),
);
