import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option } from 'effect';

import { BibleDatabase } from '../bible-db/bible-database.js';
import { BibleChapterNotFoundError } from './errors.js';
import { Reference } from './model.js';
import { BibleService } from './service.js';

const verses = [
  { book: 1, chapter: 1, verse: 1, text: 'In the beginning', versionCode: 'KJV' },
  { book: 1, chapter: 50, verse: 1, text: 'And Joseph fell', versionCode: 'KJV' },
  { book: 2, chapter: 1, verse: 1, text: 'Now these are the names', versionCode: 'KJV' },
  { book: 66, chapter: 22, verse: 1, text: 'And he shewed me', versionCode: 'KJV' },
];

const TestLayer = BibleService.Live.pipe(Layer.provide(BibleDatabase.layerTest({ verses })));

describe('BibleService', () => {
  const test = it.effect;

  test('returns a non-empty chapter with finite canonical navigation', () =>
    Effect.gen(function* () {
      const bible = yield* BibleService;
      const chapter = yield* bible.chapter(Reference.chapter(1, 50));

      expect(chapter.book.name).toBe('Genesis');
      expect(chapter.verses.map((verse) => verse.text)).toEqual(['And Joseph fell']);
      expect(Option.getOrThrow(chapter.previous)).toEqual(Reference.chapter(1, 49));
      expect(Option.getOrThrow(chapter.next)).toEqual(Reference.chapter(2, 1));
    }).pipe(Effect.provide(TestLayer)));

  test('ends navigation at the edge of the available canon', () =>
    Effect.gen(function* () {
      const bible = yield* BibleService;
      const first = yield* bible.chapter(Reference.chapter(1, 1));
      const last = yield* bible.chapter(Reference.chapter(66, 22));

      expect(Option.isNone(first.previous)).toBe(true);
      expect(Option.isNone(last.next)).toBe(true);
    }).pipe(Effect.provide(TestLayer)));

  test('reports an absent chapter in Bible language', () =>
    Effect.gen(function* () {
      const bible = yield* BibleService;
      const result = yield* Effect.result(bible.chapter(Reference.chapter(1, 3)));

      expect(result._tag).toBe('Failure');
      if (result._tag === 'Failure') {
        expect(result.failure).toBeInstanceOf(BibleChapterNotFoundError);
      }
    }).pipe(Effect.provide(TestLayer)));

  test('returns a filtered search window through the canonical interface', () =>
    Effect.gen(function* () {
      const bible = yield* BibleService;
      const window = yield* bible.searchWindow('and', {
        books: [Reference.book(1).book],
        limit: 1,
      });

      expect(window.total).toBe(1);
      expect(window.hits.map((hit) => hit.verse.reference)).toEqual([Reference.verse(1, 50, 1)]);
    }).pipe(Effect.provide(TestLayer)));
});
