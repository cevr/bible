/**
 * Bible Data Service
 *
 * Provides Bible data via local SQLite (wa-sqlite in Web Worker).
 * No HTTP calls for reads — bible.db lives in OPFS.
 */

import type { Book } from '@bible/api';
import {
  getNextChapter as getNextChapterNav,
  getPrevChapter as getPrevChapterNav,
} from '@bible/core/bible-reader';

import { BOOKS, BOOK_ALIASES, getBook, type Reference } from './types.js';

/**
 * Static Bible data methods that don't require API calls.
 */
export const bibleDataService = {
  getBooks(): readonly Book[] {
    return BOOKS.map((b) => ({
      number: b.number,
      name: b.name,
      chapters: b.chapters,
      testament: b.testament,
    }));
  },

  getBook(bookNumber: number): Book | undefined {
    const book = getBook(bookNumber);
    if (!book) return undefined;
    return {
      number: book.number,
      name: book.name,
      chapters: book.chapters,
      testament: book.testament,
    };
  },

  parseReference(ref: string): Reference | undefined {
    const input = ref.trim().toLowerCase();
    if (!input) return undefined;

    const chapterVerseMatch = input.match(/(\d+)(?::(\d+))?$/);
    if (!chapterVerseMatch) {
      const bookNum = BOOK_ALIASES[input];
      if (bookNum) {
        return { book: bookNum, chapter: 1, verse: 1 };
      }
      return undefined;
    }

    const chapterStr = chapterVerseMatch[1];
    const verseStr = chapterVerseMatch[2];
    if (!chapterStr) return undefined;

    const chapter = parseInt(chapterStr, 10);
    const verse = verseStr ? parseInt(verseStr, 10) : undefined;

    let bookPart = input.slice(0, chapterVerseMatch.index).trim();

    if (!bookPart) {
      const numberedBookMatch = input.match(/^(\d+\s*[a-z]+)/);
      if (numberedBookMatch?.[1]) {
        bookPart = numberedBookMatch[1];
      }
    }

    if (!bookPart) return undefined;

    let bookNum: number | undefined = BOOK_ALIASES[bookPart];

    if (!bookNum) {
      const noSpaces = bookPart.replace(/\s+/g, '');
      bookNum = BOOK_ALIASES[noSpaces];
    }
    if (!bookNum) {
      const withSpace = bookPart.replace(/^(\d)([a-z])/, '$1 $2');
      bookNum = BOOK_ALIASES[withSpace];
    }
    if (!bookNum) {
      const lower = bookPart.toLowerCase();
      const match = BOOKS.find(
        (b) => b.name.toLowerCase().startsWith(lower) || b.name.toLowerCase().includes(lower),
      );
      if (match) {
        bookNum = match.number;
      }
    }

    if (!bookNum) return undefined;

    const book = getBook(bookNum);
    if (!book || chapter < 1 || chapter > book.chapters) {
      return undefined;
    }

    return { book: bookNum, chapter, verse };
  },

  getNextChapter(book: number, chapter: number): Reference | undefined {
    return getNextChapterNav(book, chapter);
  },

  getPrevChapter(book: number, chapter: number): Reference | undefined {
    return getPrevChapterNav(book, chapter);
  },
};
