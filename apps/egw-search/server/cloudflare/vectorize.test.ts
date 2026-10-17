import { describe, expect, test } from 'bun:test';
import { Effect, Option } from 'effect';

import type { NeighborScope } from '@bible/core/search';
import { NO_FILTER, NO_SELECTION } from '@bible/core/writings';

import {
  MAX_TOP_K,
  UNCLASSIFIED,
  vectorMetadata,
  vectorizeFilter,
  vectorizeNeighbors,
  type VectorizeQuery,
} from './vectorize.ts';

const scope = (overrides: Partial<NeighborScope> = {}): NeighborScope => ({
  topK: 60,
  bookCode: Option.none(),
  filter: NO_FILTER,
  ...overrides,
});

describe('vectorizeFilter', () => {
  test('an unfiltered search still drops the excluded subtypes', () => {
    expect(vectorizeFilter(scope())).toEqual({ subtype: { $nin: ['ModernEnglish'] } });
  });

  test('a book wins over every other axis', () => {
    const filter = { ...NO_FILTER, type: { include: ['bible'], exclude: [] } } as const;
    expect(vectorizeFilter(scope({ bookCode: Option.some('DA'), filter }))).toEqual({
      book: { $eq: 'DA' },
    });
  });

  test('includes become $in, minus their own excludes', () => {
    const filter = {
      ...NO_FILTER,
      type: { include: ['book', 'periodical'], exclude: ['periodical'] },
    } as const;
    expect(vectorizeFilter(scope({ filter }))['type']).toEqual({ $in: ['book'] });
  });

  test('an include its excludes empty admits nothing', () => {
    const filter = { ...NO_FILTER, section: { include: ['bible'], exclude: ['bible'] } } as const;
    expect(vectorizeFilter(scope({ filter }))['section']).toEqual({ $eq: '(none of these)' });
  });

  test('excluding apparatus narrows nothing more: the index holds none', () => {
    const filter = { ...NO_FILTER, excludeApparatus: true } as const;
    expect(vectorizeFilter(scope({ filter }))).toEqual(vectorizeFilter(scope()));
  });

  test('a subtype include keeps the corpus-level exclusion', () => {
    const filter = {
      ...NO_FILTER,
      subtype: { include: ['devotional', 'ModernEnglish'], exclude: [] },
    } as const;
    expect(vectorizeFilter(scope({ filter }))['subtype']).toEqual({ $in: ['devotional'] });
  });

  test('an empty selection narrows nothing on its axis', () => {
    const filter = { ...NO_FILTER, section: NO_SELECTION } as const;
    expect(Object.keys(vectorizeFilter(scope({ filter })))).toEqual(['subtype']);
  });
});

describe('vectorizeNeighbors', () => {
  const answering = (ids: readonly string[]) => {
    const asked: Array<{ readonly vector: number[]; readonly topK: number }> = [];
    const index: VectorizeQuery = {
      query: (vector, options) =>
        Effect.runPromise(
          Effect.sync(() => {
            asked.push({ vector, topK: options.topK });
            return { matches: ids.map((id) => ({ id })) };
          }),
        ),
    };
    return { index, asked };
  };

  test('sends the int8 components and caps topK at what Vectorize returns', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const { index, asked } = answering(['DA:1', 'DA:2']);
        const neighbors = vectorizeNeighbors(index, 'fp');
        const found = yield* neighbors.nearest(Int8Array.from([1, -2, 127]), scope({ topK: 500 }));
        expect(found).toEqual({ ids: ['DA:1', 'DA:2'], scanned: 2, engine: 'vectorize' });
        expect(asked).toEqual([{ vector: [1, -2, 127], topK: MAX_TOP_K }]);
        expect(neighbors.state).toEqual({ _tag: 'ready', fingerprint: 'fp' });
      }),
    ));

  test('a refused query is a typed failure the vector leg degrades on', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const index: VectorizeQuery = { query: () => Effect.runPromise(Effect.fail('quota')) };
        const failure = yield* Effect.flip(
          vectorizeNeighbors(index, 'fp').nearest(Int8Array.from([1]), scope()),
        );
        expect(failure._tag).toBe('Search/VectorNeighborsUnavailable');
        expect(failure.engine).toBe('vectorize');
      }),
    ));
});

describe('vectorMetadata', () => {
  test('carries a known classification and marks the rest unclassified', () => {
    expect(
      vectorMetadata({
        code: 'PP',
        section: Option.some('egw-writings'),
        type: Option.some('book'),
        subtype: Option.some('no pagebreaks'),
      }),
    ).toEqual({ book: 'PP', section: 'egw-writings', type: 'book', subtype: UNCLASSIFIED });
    expect(
      vectorMetadata({
        code: 'X',
        section: Option.none(),
        type: Option.none(),
        subtype: Option.none(),
      }),
    ).toEqual({ book: 'X', section: UNCLASSIFIED, type: UNCLASSIFIED, subtype: UNCLASSIFIED });
  });
});
