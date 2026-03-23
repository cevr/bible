/**
 * Bible Data Service
 *
 * Provides access to Bible data via the unified BibleDatabase from @bible/core.
 * Uses SQLite for fast lookups and FTS5 for full-text search.
 */
import { BunServices } from '@effect/platform-bun';
import { Effect, Layer, Option, ServiceMap } from 'effect';
import { matchSorter } from 'match-sorter';

import { BibleDatabase } from '@bible/core/bible-db';
import { getNextChapterWithMap, getPrevChapterWithMap } from '@bible/core/bible-reader';

import {
  BOOK_ALIASES,
  BOOKS,
  type Book,
  type Reference,
  type SearchResult,
  type Verse,
} from './types.js';

// Service interface
export interface BibleDataService {
  readonly getBooks: () => Effect.Effect<Book[]>;
  readonly getBook: (bookNumber: number) => Effect.Effect<Book | undefined>;
  readonly getChapter: (book: number, chapter: number) => Effect.Effect<Verse[]>;
  readonly getVerse: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<Verse | undefined>;
  readonly searchVerses: (query: string, limit?: number) => Effect.Effect<SearchResult[]>;
  readonly parseReference: (ref: string) => Reference | undefined;
  readonly getNextChapter: (book: number, chapter: number) => Reference | undefined;
  readonly getPrevChapter: (book: number, chapter: number) => Reference | undefined;
}

// Effect service tag
export class BibleData extends ServiceMap.Service<BibleData, BibleDataService>()(
  '@bible/cli/data/bible/data/BibleData',
) {}

// Create the service implementation backed by BibleDatabase
const makeBibleDataService = Effect.gen(function* () {
  const db = yield* BibleDatabase;

  // Pre-load books for navigation helpers (sync operations)
  const booksResult = yield* db.getBooks().pipe(Effect.orDie);
  const bookMap = new Map<number, Book>();
  for (const b of booksResult) {
    bookMap.set(b.number, {
      number: b.number,
      name: b.name,
      chapters: b.chapters,
      testament: b.testament,
    });
  }

  return {
    getBooks: () =>
      db.getBooks().pipe(
        Effect.map((books) =>
          books.map((b) => ({
            number: b.number,
            name: b.name,
            chapters: b.chapters,
            testament: b.testament,
          })),
        ),
        Effect.orDie,
      ),

    getBook: (bookNumber: number) =>
      db.getBook(bookNumber).pipe(
        Effect.map((opt) =>
          Option.match(opt, {
            onNone: () => undefined,
            onSome: (b) => ({
              number: b.number,
              name: b.name,
              chapters: b.chapters,
              testament: b.testament,
            }),
          }),
        ),
        Effect.orDie,
      ),

    getChapter: (book: number, chapter: number) =>
      db.getChapter(book, chapter).pipe(
        Effect.map((verses) =>
          verses.map((v) => {
            const bookInfo = bookMap.get(v.book);
            return {
              book_name: bookInfo?.name ?? `Book ${v.book}`,
              book: v.book,
              chapter: v.chapter,
              verse: v.verse,
              text: v.text,
            };
          }),
        ),
        Effect.orDie,
      ),

    getVerse: (book: number, chapter: number, verse: number) =>
      db.getVerse(book, chapter, verse).pipe(
        Effect.map((opt) =>
          Option.match(opt, {
            onNone: () => undefined,
            onSome: (v) => {
              const bookInfo = bookMap.get(v.book);
              return {
                book_name: bookInfo?.name ?? `Book ${v.book}`,
                book: v.book,
                chapter: v.chapter,
                verse: v.verse,
                text: v.text,
              };
            },
          }),
        ),
        Effect.orDie,
      ),

    searchVerses: (query: string, limit = 50) =>
      db.searchVerses(query, limit).pipe(
        Effect.map((results) =>
          results.map((r, index) => {
            const bookInfo = bookMap.get(r.book);
            return {
              verse: {
                book_name: bookInfo?.name ?? `Book ${r.book}`,
                book: r.book,
                chapter: r.chapter,
                verse: r.verse,
                text: r.text,
              },
              reference: {
                book: r.book,
                chapter: r.chapter,
                verse: r.verse,
              },
              matchScore: 1 - index / Math.max(results.length, 1),
            };
          }),
        ),
        Effect.orDie,
      ),

    // Synchronous helpers that don't need database access
    parseReference(ref: string): Reference | undefined {
      const input = ref.trim().toLowerCase();
      if (input.length === 0) return undefined;

      const chapterVerseMatch = input.match(/(\d+)(?::(\d+))?$/);
      if (chapterVerseMatch === null) {
        const bookNum = BOOK_ALIASES[input];
        if (bookNum !== undefined) {
          return { book: bookNum, chapter: 1, verse: 1 };
        }
        return undefined;
      }

      const chapterStr = chapterVerseMatch[1];
      const verseStr = chapterVerseMatch[2];
      if (chapterStr === undefined) return undefined;

      const chapter = parseInt(chapterStr, 10);
      const verse = verseStr !== undefined ? parseInt(verseStr, 10) : undefined;

      let bookPart = input.slice(0, chapterVerseMatch.index).trim();

      if (bookPart.length === 0) {
        const numberedBookMatch = input.match(/^(\d+\s*[a-z]+)/);
        if (numberedBookMatch?.[1] !== undefined) {
          bookPart = numberedBookMatch[1];
        }
      }

      if (bookPart.length === 0) return undefined;

      let bookNum: number | undefined = BOOK_ALIASES[bookPart];

      if (bookNum === undefined) {
        const noSpaces = bookPart.replace(/\s+/g, '');
        bookNum = BOOK_ALIASES[noSpaces];
      }
      if (bookNum === undefined) {
        const withSpace = bookPart.replace(/^(\d)([a-z])/, '$1 $2');
        bookNum = BOOK_ALIASES[withSpace];
      }
      if (bookNum === undefined) {
        const bookMatches = matchSorter(BOOKS, bookPart, {
          keys: ['name'],
          threshold: matchSorter.rankings.WORD_STARTS_WITH,
        });
        const firstMatch = bookMatches[0];
        if (firstMatch !== undefined) {
          bookNum = firstMatch.number;
        }
      }

      if (bookNum === undefined) return undefined;

      const book = bookMap.get(bookNum);
      if (book === undefined || chapter < 1 || chapter > book.chapters) {
        return undefined;
      }

      return { book: bookNum, chapter, verse };
    },

    getNextChapter(book: number, chapter: number): Reference | undefined {
      return getNextChapterWithMap(bookMap, book, chapter);
    },

    getPrevChapter(book: number, chapter: number): Reference | undefined {
      return getPrevChapterWithMap(bookMap, book, chapter);
    },
  } satisfies BibleDataService;
});

// Live layer - requires BibleDatabase
export const BibleDataLive = Layer.effect(BibleData, makeBibleDataService).pipe(
  Layer.provide(BibleDatabase.Default),
  Layer.provide(BunServices.layer),
);
