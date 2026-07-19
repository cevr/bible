import { EGWApiClient, EGWApiError } from '@bible/core/egw';
import { EGWParagraphDatabase } from '@bible/core/egw-db';
import { WritingsLibraryRuntime } from '@bible/core/procedure';
import { Effect, Layer, Stream } from 'effect';
import { describe, expect, test } from 'vitest';

import { layerDesktopWritingsLibrary } from '../electron/writings-library-runtime.js';

const installedBooks = EGWParagraphDatabase.Test({
  books: [
    {
      book_id: 127,
      book_code: 'PP',
      book_title: 'Patriarchs and Prophets',
      book_author: 'Ellen G. White',
      paragraph_count: 42,
      created_at: '2026-07-19T00:00:00.000Z',
    },
  ],
});

const offlineApi = Layer.effect(
  EGWApiClient,
  Effect.gen(function* () {
    const testApi = yield* EGWApiClient;
    return EGWApiClient.of({
      ...testApi,
      getBooks: () =>
        Stream.fail(
          new EGWApiError({
            message: 'offline',
            cause: 'network unavailable',
          }),
        ),
    });
  }),
).pipe(Layer.provide(EGWApiClient.Test()));

describe('desktop writings library runtime', () => {
  test('keeps an installed publication readable offline without sync metadata', async () => {
    const layer = layerDesktopWritingsLibrary.pipe(
      Layer.provide(Layer.merge(installedBooks, offlineApi)),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const library = yield* WritingsLibraryRuntime;
        return yield* library.get;
      }).pipe(Effect.provide(layer)),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 127,
      code: 'PP',
      source: 'local',
      status: 'success',
      paragraphCount: 42,
    });
  });
});
