import { type Schemas } from '@bible/core/egw';
import { Effect, Layer, Option, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import { EGWData } from '../src/services/egw-data.js';
import { EGWIpcClient } from '../src/services/egw-ipc-client.js';

const book = (overrides: Partial<Schemas.Book>): Schemas.Book =>
  ({
    book_id: 84,
    code: 'PP',
    title: 'Patriarchs and Prophets',
    author: 'Ellen G. White',
    lang: 'en',
    type: 'book',
    npages: 800,
    nelements: 5000,
    cover: { small: '', large: '' },
    files: { mp3: null, pdf: null, epub: null, mobi: null },
    permission_required: 'public',
    ...overrides,
  }) as Schemas.Book;

const runWithBooks = <A>(
  effect: Effect.Effect<A, unknown, EGWData>,
  books: readonly Schemas.Book[],
): Promise<A> =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(
        EGWData.layer.pipe(
          Layer.provide(EGWIpcClient.layerTest({ getBooks: () => Stream.fromIterable(books) })),
        ),
      ),
    ),
  );

describe('EGWData', () => {
  it('listBooks collapses the EGW Stream into a readonly array', async () => {
    const books = [book({ book_id: 1, code: 'PP' }), book({ book_id: 2, code: 'GC' })];
    const result = await runWithBooks(
      Effect.gen(function* () {
        const data = yield* EGWData;
        return yield* data.listBooks('en');
      }),
      books,
    );
    expect(result).toHaveLength(2);
    expect(result.map((b) => b.code)).toEqual(['PP', 'GC']);
  });

  it('layerTest returns empty defaults', async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const data = yield* EGWData;
        return {
          books: yield* data.listBooks('en'),
          toc: yield* data.getToc(1),
        };
      }).pipe(Effect.provide(EGWData.layerTest())),
    );
    expect(result.books).toEqual([]);
    expect(result.toc).toEqual([]);
  });

  it('layerTest accepts per-method overrides', async () => {
    const customToc: readonly Schemas.TocItem[] = [
      {
        para_id: Option.some('84.155'),
        level: 1,
        title: 'Ch 1',
        refcode_short: Option.some('PP 1'),
        puborder: 1,
      },
    ];
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const data = yield* EGWData;
        return yield* data.getToc(84);
      }).pipe(
        Effect.provide(
          EGWData.layerTest({
            getToc: () => Effect.succeed(customToc),
          }),
        ),
      ),
    );
    expect(result).toEqual(customToc);
  });
});
