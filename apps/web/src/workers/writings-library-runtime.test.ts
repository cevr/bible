import { describe, expect, test } from 'bun:test';
import { WritingsLibraryRuntime } from '@bible/core/procedure';
import { publicationId, WritingsLibraryPublication } from '@bible/core/writings';
import { Effect, Schema } from 'effect';

import type { EgwLocalBook, EgwSyncStatus, WorkerEgwDatabase } from './egw-database.js';
import { layerWebWritingsLibrary } from './writings-library-runtime.js';

const remote = {
  bookId: 127,
  bookCode: 'PP',
  title: 'Patriarchs and Prophets',
  author: 'Ellen G. White',
  paragraphCount: 42,
};

describe('web writings library runtime', () => {
  test('projects remote status and makes a downloaded publication local', async () => {
    let statuses: readonly EgwSyncStatus[] = [];
    let localBooks: readonly EgwLocalBook[] = [];
    let downloads = 0;
    const database: WorkerEgwDatabase = {
      initialize: () => Promise.resolve(),
      query: () => Promise.resolve([]),
      getBooks: () => Promise.resolve(localBooks),
      getSyncStatus: () => Promise.resolve(statuses),
      syncBook: (code) => {
        downloads += 1;
        localBooks = [
          {
            bookId: remote.bookId,
            bookCode: code,
            title: remote.title,
            author: remote.author,
            paragraphCount: 42,
          },
        ];
        statuses = [
          {
            bookId: remote.bookId,
            bookCode: code,
            status: 'success',
            paragraphCount: 42,
            error: null,
          },
        ];
        return Promise.resolve(42);
      },
      syncFull: () => Promise.resolve(),
      autoSyncBibleCommentaries: () => Promise.resolve(),
    };
    const layer = layerWebWritingsLibrary({
      database,
      fetch: () => Promise.resolve(Response.json([remote])),
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const library = yield* WritingsLibraryRuntime;
        const before = yield* library.get;
        const downloaded = yield* library.download(publicationId(127));
        const skipped = yield* library.downloadAll;
        const after = yield* library.get;
        return { before, downloaded, skipped, after };
      }).pipe(Effect.provide(layer)),
    );

    expect(result.before[0]).toMatchObject({ code: 'PP', source: 'remote', status: 'pending' });
    expect(result.downloaded).toMatchObject({ code: 'PP', status: 'success' });
    expect(result.skipped).toEqual([]);
    expect(downloads).toBe(1);
    expect(result.after[0]).toMatchObject({ code: 'PP', source: 'local', status: 'success' });
  });

  test('keeps an installed publication readable offline without sync metadata', async () => {
    const database: WorkerEgwDatabase = {
      initialize: () => Promise.resolve(),
      query: () => Promise.resolve([]),
      getBooks: () =>
        Promise.resolve([
          {
            bookId: remote.bookId,
            bookCode: remote.bookCode,
            title: remote.title,
            author: remote.author,
            paragraphCount: 42,
          },
        ]),
      getSyncStatus: () => Promise.resolve([]),
      syncBook: () => Promise.reject(new Error('offline')),
      syncFull: () => Promise.resolve(),
      autoSyncBibleCommentaries: () => Promise.resolve(),
    };
    const layer = layerWebWritingsLibrary({
      database,
      fetch: () => Promise.reject(new Error('offline')),
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const library = yield* WritingsLibraryRuntime;
        return yield* library.get;
      }).pipe(Effect.provide(layer)),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: remote.bookId,
      code: 'PP',
      source: 'local',
      status: 'success',
      paragraphCount: 42,
    });
  });

  test('returns an encodable status-only publication when both catalogs lack metadata', async () => {
    const database: WorkerEgwDatabase = {
      initialize: () => Promise.resolve(),
      query: () => Promise.resolve([]),
      getBooks: () => Promise.resolve([]),
      getSyncStatus: () =>
        Promise.resolve([
          {
            bookId: remote.bookId,
            bookCode: remote.bookCode,
            status: 'failed',
            paragraphCount: 0,
            error: 'offline',
          },
        ]),
      syncBook: () => Promise.reject(new Error('offline')),
      syncFull: () => Promise.resolve(),
      autoSyncBibleCommentaries: () => Promise.resolve(),
    };
    const layer = layerWebWritingsLibrary({
      database,
      fetch: () => Promise.reject(new Error('offline')),
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const library = yield* WritingsLibraryRuntime;
        return yield* library.get;
      }).pipe(Effect.provide(layer)),
    );
    const encoded = Schema.encodeSync(Schema.Array(WritingsLibraryPublication))(result);

    expect(encoded[0]).toMatchObject({
      id: remote.bookId,
      code: 'PP',
      author: 'Unknown author',
      source: 'empty',
      status: 'failed',
      error: 'offline',
    });
  });
});
