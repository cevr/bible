import { describe, expect, it } from 'bun:test';

import {
  BIBLE_BOOKS,
  Chapter,
  ParsedBibleQuery,
  Reference,
  Verse,
  getBibleBook,
} from '@bible/core/bible';
import { BibleService } from '@bible/core/bible/service';
import { Effect, Option } from 'effect';

import { isStrongsNumber } from '../../src/commands/bible.js';
import { versesForBibleQuery } from '../../src/lib/bible-query.js';

const chapter = (bookNumber: number, chapterNumber: number, texts: readonly string[]) => {
  const book = getBibleBook(bookNumber);
  if (book === undefined) throw new Error(`Unknown test book ${bookNumber}`);
  return new Chapter({
    book,
    reference: Reference.chapter(bookNumber, chapterNumber),
    verses: texts.map(
      (text, index) =>
        new Verse({
          reference: Reference.verse(bookNumber, chapterNumber, index + 1),
          text,
        }),
    ) as [Verse, ...Verse[]],
    previous: Option.none(),
    next: Option.none(),
  });
};

const chapters = new Map([
  [
    '43:3',
    chapter(43, 3, [
      'For God so loved the world...',
      'For God sent not his Son...',
      'He that believeth...',
    ]),
  ],
  ['8:1', chapter(8, 1, ['Now it came to pass...', 'And the name of the man...'])],
  ['8:2', chapter(8, 2, ['And Naomi had a kinsman...'])],
  ['19:1', chapter(19, 1, ['Blessed is the man...', 'But his delight...'])],
  ['19:2', chapter(19, 2, ['Why do the heathen rage...'])],
  ['19:3', chapter(19, 3, ['LORD, how are they increased...'])],
  ['31:1', chapter(31, 1, ['The vision of Obadiah...'])],
]);

const BibleTest = BibleService.Test({ books: BIBLE_BOOKS, chapters });
const resolve = (query: ReturnType<typeof ParsedBibleQuery.search>) =>
  Effect.runPromise(versesForBibleQuery(query).pipe(Effect.provide(BibleTest)));

describe('canonical Bible query integration', () => {
  it('resolves a single verse', async () => {
    const verses = await resolve(ParsedBibleQuery.single(43, 3, 1));
    expect(verses.map((verse) => Number(verse.reference.verse))).toEqual([1]);
  });

  it('resolves a full chapter', async () => {
    expect(await resolve(ParsedBibleQuery.chapter(43, 3))).toHaveLength(3);
  });

  it('resolves a verse range', async () => {
    const verses = await resolve(ParsedBibleQuery.verseRange(43, 3, 1, 2));
    expect(verses.map((verse) => Number(verse.reference.verse))).toEqual([1, 2]);
  });

  it('resolves a chapter range', async () => {
    expect(await resolve(ParsedBibleQuery.chapterRange(19, 1, 3))).toHaveLength(4);
  });

  it('resolves a full book through the canonical book metadata', async () => {
    expect(await resolve(ParsedBibleQuery.fullBook(31))).toHaveLength(1);
  });
});

describe('bible concordance', () => {
  it("detects Hebrew and Greek Strong's numbers", () => {
    expect(isStrongsNumber('H1234')).toBe(true);
    expect(isStrongsNumber('h1234')).toBe(true);
    expect(isStrongsNumber('G5678')).toBe(true);
    expect(isStrongsNumber('g26')).toBe(true);
  });

  it("rejects invalid Strong's queries", () => {
    expect(isStrongsNumber('1234')).toBe(false);
    expect(isStrongsNumber('love')).toBe(false);
    expect(isStrongsNumber('H1234abc')).toBe(false);
    expect(isStrongsNumber('A1234')).toBe(false);
  });
});
