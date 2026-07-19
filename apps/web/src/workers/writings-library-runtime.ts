import { EGWBookInfoSchema } from '@bible/api';
import {
  publicationCode,
  publicationId,
  WritingsDownloadResult,
  WritingsLibraryPublication,
} from '@bible/core/writings';
import { ProcedureError, WritingsLibraryRuntime } from '@bible/core/procedure';
import { Effect, Layer, Result, Schema } from 'effect';

import type { EgwLocalBook, EgwSyncStatus, WorkerEgwDatabase } from './egw-database.js';

const failure = (procedure: string, cause: unknown) => {
  let message = String(cause);
  if (cause instanceof Error) message = cause.message;
  return new ProcedureError({
    procedure,
    code: 'WritingsLibraryFailure',
    message,
  });
};

export const layerWebWritingsLibrary = (options: {
  readonly database: WorkerEgwDatabase;
  readonly fetch?: (url: string) => Promise<Response>;
}) => {
  let fetchResponse: (url: string) => Promise<Response> = globalThis.fetch;
  if (options.fetch !== undefined) fetchResponse = options.fetch;
  const localCatalog = Effect.all([
    Effect.tryPromise({ try: () => options.database.getBooks(), catch: (cause) => cause }),
    Effect.tryPromise({ try: () => options.database.getSyncStatus(), catch: (cause) => cause }),
  ]);
  const remoteCatalog = Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetchResponse('/api/egw/books'),
      catch: (cause) => cause,
    });
    if (!response.ok) {
      return yield* Effect.fail(`Writings catalog request failed: ${String(response.status)}`);
    }
    const json = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (cause) => cause,
    });
    return yield* Schema.decodeUnknownEffect(Schema.Array(EGWBookInfoSchema))(json);
  });

  const statusFor = (local: EgwLocalBook | undefined, sync: EgwSyncStatus | undefined) => {
    if (local !== undefined && local.paragraphCount > 0) return 'success' as const;
    if (sync?.status === 'failed') return 'failed' as const;
    return 'pending' as const;
  };
  const sourceFor = (status: 'pending' | 'success' | 'failed', unavailable: 'remote' | 'empty') => {
    if (status === 'success') return 'local' as const;
    return unavailable;
  };

  const get = Effect.gen(function* () {
    const [localResult, remoteResult] = yield* Effect.all([
      Effect.result(localCatalog),
      Effect.result(remoteCatalog),
    ]);
    if (Result.isFailure(localResult) && Result.isFailure(remoteResult)) {
      return yield* Effect.fail(
        failure('v1.reading.writingsLibrary.get', remoteResult.failure),
      );
    }

    let localBooks: readonly EgwLocalBook[] = [];
    let statuses: readonly EgwSyncStatus[] = [];
    if (Result.isSuccess(localResult)) [localBooks, statuses] = localResult.success;
    let remoteBooks: readonly Schema.Schema.Type<typeof EGWBookInfoSchema>[] = [];
    if (Result.isSuccess(remoteResult)) remoteBooks = remoteResult.success;
    const localById = new Map(localBooks.map((book) => [book.bookId, book]));
    const statusById = new Map(statuses.map((status) => [status.bookId, status]));
    const entries = new Map<number, WritingsLibraryPublication>();

    for (const book of remoteBooks) {
      const local = localById.get(book.bookId);
      const sync = statusById.get(book.bookId);
      const status = statusFor(local, sync);
      entries.set(
        book.bookId,
        new WritingsLibraryPublication({
          id: publicationId(book.bookId),
          code: publicationCode(book.bookCode),
          title: local?.title ?? book.title,
          author: local?.author ?? book.author,
          paragraphCount: local?.paragraphCount ?? sync?.paragraphCount ?? book.paragraphCount ?? 0,
          source: sourceFor(status, 'remote'),
          status,
          error: sync?.error ?? null,
        }),
      );
    }

    for (const book of localBooks) {
      if (entries.has(book.bookId)) continue;
      const sync = statusById.get(book.bookId);
      const status = statusFor(book, sync);
      entries.set(
        book.bookId,
        new WritingsLibraryPublication({
          id: publicationId(book.bookId),
          code: publicationCode(book.bookCode),
          title: book.title,
          author: book.author,
          paragraphCount: book.paragraphCount,
          source: sourceFor(status, 'empty'),
          status,
          error: sync?.error ?? null,
        }),
      );
    }

    for (const sync of statuses) {
      if (entries.has(sync.bookId)) continue;
      if (sync.bookId <= 0) continue;
      const status = statusFor(undefined, sync);
      entries.set(
        sync.bookId,
        new WritingsLibraryPublication({
          id: publicationId(sync.bookId),
          code: publicationCode(sync.bookCode),
          title: sync.bookCode,
          author: 'Unknown author',
          paragraphCount: 0,
          source: 'empty',
          status,
          error: sync.error,
        }),
      );
    }

    return Array.from(entries.values());
  });

  const resultFor = (publication: WritingsLibraryPublication) =>
    new WritingsDownloadResult({
      publicationId: publication.id,
      code: publication.code,
      status: publication.status,
      paragraphCount: publication.paragraphCount,
      error: publication.error,
    });

  return Layer.succeed(
    WritingsLibraryRuntime,
    WritingsLibraryRuntime.of({
      get,
      download: (id) =>
        Effect.gen(function* () {
          const entries = yield* get;
          const publication = entries.find((entry) => entry.id === id);
          if (!publication) {
            return yield* Effect.fail(failure('v1.reading.writingsPublication.download', id));
          }
          yield* Effect.tryPromise({
            try: () => options.database.syncBook(publication.code, () => {}),
            catch: (cause) => failure('v1.reading.writingsPublication.download', cause),
          });
          const refreshed = yield* get;
          return resultFor(refreshed.find((entry) => entry.id === id) ?? publication);
        }),
      downloadAll: Effect.gen(function* () {
        const entries = yield* get;
        const pending = entries.filter((entry) => entry.status !== 'success');
        yield* Effect.forEach(
          pending,
          (publication) =>
            Effect.tryPromise({
              try: () => options.database.syncBook(publication.code, () => {}),
              catch: (cause) => failure('v1.reading.writingsLibrary.downloadAll', cause),
            }),
          { discard: true },
        );
        const refreshed = yield* get;
        const pendingIds = new Set(pending.map((entry) => entry.id));
        return refreshed.filter((entry) => pendingIds.has(entry.id)).map(resultFor);
      }),
    }),
  );
};
