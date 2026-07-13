import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import { CategoryId, HymnId, VerseId } from '../types/ids.js';
import { Category, Hymn, HymnVerse } from './schemas.js';
import { HymnalService } from './service.js';

const worship = new Category({ id: CategoryId.make(1), name: 'Worship' });
const gospel = new Category({ id: CategoryId.make(2), name: 'Gospel' });
const longFirstLine = 'A'.repeat(61);

const hymns = [
  new Hymn({
    id: HymnId.make(1),
    name: 'Morning Praise',
    category: worship.name,
    categoryId: worship.id,
    verses: [new HymnVerse({ id: VerseId.make(1), text: `${longFirstLine}\nSecond line` })],
  }),
  new Hymn({
    id: HymnId.make(2),
    name: 'Amazing Grace',
    category: gospel.name,
    categoryId: gospel.id,
    verses: [new HymnVerse({ id: VerseId.make(1), text: 'How sweet the sound' })],
  }),
  new Hymn({
    id: HymnId.make(3),
    name: 'Faith of Our Fathers',
    category: gospel.name,
    categoryId: gospel.id,
    verses: [new HymnVerse({ id: VerseId.make(1), text: 'Living still' })],
  }),
] as const;

const TestLayer = HymnalService.Test({ hymns, categories: [worship, gospel] });

const run = <A, E>(effect: Effect.Effect<A, E, HymnalService>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(TestLayer)));

describe('HymnalService', () => {
  test('returns a hymn by number', async () => {
    const hymn = await run(HymnalService.use((service) => service.getHymn(HymnId.make(2))));
    expect(hymn.name).toBe('Amazing Grace');
  });

  test('fails with HymnNotFoundError when the hymn is absent', async () => {
    const error = await Effect.runPromise(
      HymnalService.use((service) => service.getHymn(HymnId.make(920))).pipe(
        Effect.provide(TestLayer),
        Effect.flip,
      ),
    );
    expect(error._tag).toBe('HymnNotFoundError');
    if (error._tag === 'HymnNotFoundError') {
      expect(error.id).toBe(920);
    }
  });

  test('returns categories and filters summaries by category', async () => {
    const result = await run(
      HymnalService.use((service) =>
        Effect.all({
          categories: service.getCategories(),
          hymns: service.getHymnsByCategory(gospel.id),
        }),
      ),
    );

    expect(result.categories.map((category) => category.name)).toEqual(['Worship', 'Gospel']);
    expect(result.hymns.map((hymn) => hymn.name)).toEqual([
      'Amazing Grace',
      'Faith of Our Fathers',
    ]);
  });

  test('searches case-insensitively and honors the requested limit', async () => {
    const byName = await run(HymnalService.use((service) => service.searchHymns('GRACE', 1)));
    const byLyrics = await run(HymnalService.use((service) => service.searchHymns('living', 1)));
    const limited = await run(HymnalService.use((service) => service.searchHymns('a', 2)));

    expect(byName.map((hymn) => hymn.id)).toEqual([HymnId.make(2)]);
    expect(byLyrics.map((hymn) => hymn.id)).toEqual([HymnId.make(3)]);
    expect(limited).toHaveLength(2);
  });

  test('uses the same first-line truncation for category and search summaries', async () => {
    const result = await run(
      HymnalService.use((service) =>
        Effect.all({
          category: service.getHymnsByCategory(worship.id),
          search: service.searchHymns('morning'),
        }),
      ),
    );
    const expected = `${'A'.repeat(60)}...`;

    expect(result.category[0]?.firstLine).toBe(expected);
    expect(result.search[0]?.firstLine).toBe(expected);
  });
});
