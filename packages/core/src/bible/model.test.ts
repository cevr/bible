import { describe, expect, test } from 'bun:test';
import { Option, Schema } from 'effect';

import {
  Book,
  Chapter,
  Reference,
  Verse,
  bookNumber,
  chapterNumber,
  verseNumber,
} from './model.js';

describe('Bible domain', () => {
  test('rejects coordinates outside the canon', () => {
    expect(() => bookNumber(0)).toThrow();
    expect(() => bookNumber(67)).toThrow();
    expect(() => chapterNumber(0)).toThrow();
    expect(() => verseNumber(0)).toThrow();
  });

  test('models book, chapter, verse, and range references as distinct states', () => {
    expect(Reference.book(43)._tag).toBe('book');
    expect(Reference.chapter(43, 3)._tag).toBe('chapter');
    expect(Reference.verse(43, 3, 16)._tag).toBe('verse');
    expect(Reference.range(Reference.verse(43, 3, 16), Reference.verse(43, 3, 18))._tag).toBe(
      'range',
    );
  });

  test('rejects a backwards verse range', () => {
    expect(() => Reference.range(Reference.verse(43, 3, 18), Reference.verse(43, 3, 16))).toThrow(
      'Bible verse range must be ordered',
    );
  });

  test('a chapter is non-empty and owns navigation', () => {
    const book = new Book({
      number: bookNumber(43),
      name: 'John',
      abbreviation: 'John',
      chapters: chapterNumber(21),
      testament: 'new',
    });
    const reference = Reference.chapter(43, 3);
    const verse = new Verse({ reference: Reference.verse(43, 3, 16), text: 'For God so loved' });
    const chapter = new Chapter({
      book,
      reference,
      verses: [verse],
      previous: Option.some(Reference.chapter(43, 2)),
      next: Option.some(Reference.chapter(43, 4)),
    });

    expect(chapter.verses).toHaveLength(1);
    expect(Number(Option.getOrThrow(chapter.next).chapter)).toBe(4);
    expect(() =>
      Schema.decodeUnknownSync(Chapter)({
        book: chapter.book,
        reference: chapter.reference,
        verses: [],
        previous: chapter.previous,
        next: chapter.next,
      }),
    ).toThrow();
  });
});
