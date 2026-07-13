import { describe, expect, test } from 'bun:test';
import { Effect, Layer, Option } from 'effect';

import { BibleDatabase } from '../bible-db/bible-database.js';
import { BibleChapterNotFoundError } from './errors.js';
import { Reference } from './model.js';
import { BibleService } from './service.js';

const books = [
  {
    number: 1,
    name: 'Genesis',
    abbreviation: 'Gen',
    testament: 'old' as const,
    chapters: 2,
  },
  {
    number: 2,
    name: 'Exodus',
    abbreviation: 'Exod',
    testament: 'old' as const,
    chapters: 1,
  },
];

const verses = [
  { book: 1, chapter: 1, verse: 1, text: 'In the beginning', versionCode: 'KJV' },
  { book: 1, chapter: 2, verse: 1, text: 'Thus the heavens', versionCode: 'KJV' },
  { book: 2, chapter: 1, verse: 1, text: 'Now these are the names', versionCode: 'KJV' },
];

const TestLayer = BibleService.Live.pipe(Layer.provide(BibleDatabase.Test({ books, verses })));

const run = <A, E>(effect: Effect.Effect<A, E, BibleService>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(TestLayer)));

describe('BibleService', () => {
  test('returns a non-empty chapter with finite canonical navigation', async () => {
    const chapter = await run(
      Effect.flatMap(BibleService, (bible) => bible.chapter(Reference.chapter(1, 2))),
    );

    expect(chapter.book.name).toBe('Genesis');
    expect(chapter.verses.map((verse) => verse.text)).toEqual(['Thus the heavens']);
    expect(Option.getOrThrow(chapter.previous)).toEqual(Reference.chapter(1, 1));
    expect(Option.getOrThrow(chapter.next)).toEqual(Reference.chapter(2, 1));
  });

  test('ends navigation at the edge of the available canon', async () => {
    const first = await run(
      Effect.flatMap(BibleService, (bible) => bible.chapter(Reference.chapter(1, 1))),
    );
    const last = await run(
      Effect.flatMap(BibleService, (bible) => bible.chapter(Reference.chapter(2, 1))),
    );

    expect(Option.isNone(first.previous)).toBe(true);
    expect(Option.isNone(last.next)).toBe(true);
  });

  test('reports an absent chapter in Bible language', async () => {
    const result = await run(
      Effect.flatMap(BibleService, (bible) =>
        Effect.result(bible.chapter(Reference.chapter(1, 3))),
      ),
    );

    expect(result._tag).toBe('Failure');
    if (result._tag === 'Failure') {
      expect(result.failure).toBeInstanceOf(BibleChapterNotFoundError);
    }
  });
});
