import { EGWApiClient, type Schemas } from '@bible/core/egw';
import {
  EGWParagraphDatabase,
  type BookRow,
  type SyncStatusRow,
} from '@bible/core/egw-db';
import { ProcedureError, WritingsLibraryRuntime } from '@bible/core/procedure';
import { downloadBookToLocal } from '@bible/core/sync/egw';
import {
  publicationCode,
  publicationId,
  WritingsDownloadResult,
  WritingsLibraryPublication,
} from '@bible/core/writings';
import { Effect, Layer, Option, Result, Stream } from 'effect';

const failure = (procedure: string) => (cause: unknown) => {
  let message = String(cause);
  if (typeof cause === 'object' && cause !== null && 'message' in cause) {
    message = String(cause.message);
  }
  return new ProcedureError({
    procedure,
    code: 'WritingsLibraryFailure',
    message,
  });
};

const statusFor = (paragraphCount: number | undefined, syncStatus: string | undefined) => {
  if (paragraphCount !== undefined && paragraphCount > 0) return 'success' as const;
  if (syncStatus === 'failed') return 'failed' as const;
  return 'pending' as const;
};

const sourceFor = (status: 'pending' | 'success' | 'failed', unavailable: 'remote' | 'empty') => {
  if (status === 'success') return 'local' as const;
  return unavailable;
};

export const layerDesktopWritingsLibrary = Layer.effect(
  WritingsLibraryRuntime,
  Effect.gen(function* () {
    const api = yield* EGWApiClient;
    const database = yield* EGWParagraphDatabase;

    const get = Effect.gen(function* () {
      const [remoteResult, localResult, statusResult] = yield* Effect.all([
        Effect.result(Stream.runCollect(api.getBooks({ lang: 'en' }))),
        Effect.result(Stream.runCollect(database.getAllBooks())),
        Effect.result(database.getAllSyncStatus()),
      ]);
      let hasLocalCatalog = Result.isSuccess(localResult);
      if (
        !hasLocalCatalog &&
        Result.isSuccess(statusResult) &&
        statusResult.success.length > 0
      ) {
        hasLocalCatalog = true;
      }
      if (Result.isFailure(remoteResult) && !hasLocalCatalog) {
        return yield* Effect.fail(remoteResult.failure);
      }

      let remote: readonly Schemas.Book[] = [];
      if (Result.isSuccess(remoteResult)) remote = remoteResult.success;
      let local: readonly BookRow[] = [];
      if (Result.isSuccess(localResult)) local = localResult.success;
      let statuses: readonly SyncStatusRow[] = [];
      if (Result.isSuccess(statusResult)) statuses = statusResult.success;
      const localById = new Map(local.map((book) => [book.book_id, book]));
      const statusById = new Map(statuses.map((status) => [status.book_id, status]));
      const entries = new Map<number, WritingsLibraryPublication>();

      for (const book of remote) {
        const installed = localById.get(book.book_id);
        const sync = statusById.get(book.book_id);
        const status = statusFor(installed?.paragraph_count, sync?.status);
        entries.set(
          book.book_id,
          new WritingsLibraryPublication({
            id: publicationId(book.book_id),
            code: publicationCode(book.code),
            title: installed?.book_title ?? book.title,
            author: installed?.book_author ?? book.author,
            paragraphCount:
              installed?.paragraph_count ?? sync?.paragraph_count ?? book.nelements ?? 0,
            source: sourceFor(status, 'remote'),
            status,
            error: sync?.error_message ?? null,
          }),
        );
      }

      for (const book of local) {
        if (entries.has(book.book_id)) continue;
        const sync = statusById.get(book.book_id);
        const status = statusFor(book.paragraph_count, sync?.status);
        entries.set(
          book.book_id,
          new WritingsLibraryPublication({
            id: publicationId(book.book_id),
            code: publicationCode(book.book_code),
            title: book.book_title,
            author: book.book_author,
            paragraphCount: book.paragraph_count,
            source: sourceFor(status, 'empty'),
            status,
            error: sync?.error_message ?? null,
          }),
        );
      }

      for (const sync of statuses) {
        if (entries.has(sync.book_id)) continue;
        if (sync.book_id <= 0) continue;
        entries.set(
          sync.book_id,
          new WritingsLibraryPublication({
            id: publicationId(sync.book_id),
            code: publicationCode(sync.book_code),
            title: sync.book_code,
            author: 'Unknown author',
            paragraphCount: 0,
            source: 'empty',
            status: statusFor(undefined, sync.status),
            error: sync.error_message,
          }),
        );
      }

      return Array.from(entries.values());
    }).pipe(Effect.mapError(failure('v1.reading.writingsLibrary.get')));

    const download = (id: ReturnType<typeof publicationId>) =>
      Effect.gen(function* () {
        const book = yield* api.getBook(id);
        const result = yield* downloadBookToLocal(book).pipe(
          Effect.provideService(EGWApiClient, api),
          Effect.provideService(EGWParagraphDatabase, database),
        );
        if (result._tag === 'success') yield* database.rebuildFtsIndex();
        const status = yield* database.getSyncStatus(id);
        let downloadStatus: 'pending' | 'success' | 'failed' = 'pending';
        let error: string | null = null;
        if (result._tag === 'success') {
          downloadStatus = 'success';
        } else if (result._tag === 'failed') {
          downloadStatus = 'failed';
          error = result.reason;
        } else {
          error = result.reason;
        }
        return new WritingsDownloadResult({
          publicationId: id,
          code: publicationCode(book.code),
          status: downloadStatus,
          paragraphCount: Option.match(status, {
            onNone: () => 0,
            onSome: (value) => value.paragraph_count,
          }),
          error,
        });
      }).pipe(Effect.mapError(failure('v1.reading.writingsPublication.download')));

    return WritingsLibraryRuntime.of({
      get,
      download,
      downloadAll: Effect.gen(function* () {
        const entries = yield* get;
        return yield* Effect.forEach(
          entries.filter((entry) => entry.status !== 'success'),
          (entry) => download(entry.id),
          { concurrency: 2 },
        );
      }).pipe(Effect.mapError(failure('v1.reading.writingsLibrary.downloadAll'))),
    });
  }),
);
