/**
 * Bible Navigation Helpers
 *
 * Pure functions for navigating between chapters and books.
 * No Effect dependency - can be used synchronously.
 */

import type { BibleBook, BibleReference } from './types.js';
import { BIBLE_BOOKS, getBibleBook } from './books.js';

/**
 * Get the next chapter reference.
 * Wraps to the next book when at the last chapter.
 * Wraps to Genesis 1 when at Revelation 22.
 */
export function getNextChapter(book: number, chapter: number): BibleReference | undefined {
  const currentBook = getBibleBook(book);
  if (!currentBook) return undefined;

  // Next chapter in same book
  if (chapter < currentBook.chapters) {
    return { book, chapter: chapter + 1 };
  }

  // Move to next book
  const nextBook = getBibleBook(book + 1);
  if (nextBook) {
    return { book: book + 1, chapter: 1 };
  }

  // Wrap to Genesis
  return { book: 1, chapter: 1 };
}

/**
 * Get the previous chapter reference.
 * Wraps to the previous book when at chapter 1.
 * Wraps to Revelation 22 when at Genesis 1.
 */
export function getPrevChapter(book: number, chapter: number): BibleReference | undefined {
  // Previous chapter in same book
  if (chapter > 1) {
    return { book, chapter: chapter - 1 };
  }

  // Move to previous book
  const prevBook = getBibleBook(book - 1);
  if (prevBook) {
    return { book: book - 1, chapter: prevBook.chapters };
  }

  // Wrap to Revelation
  const lastBook = BIBLE_BOOKS[BIBLE_BOOKS.length - 1];
  if (lastBook) {
    return { book: lastBook.number, chapter: lastBook.chapters };
  }

  return undefined;
}

/**
 * Get the next chapter reference using a book lookup map.
 * More efficient when you already have a Map of books.
 */
export function getNextChapterWithMap(
  bookMap: ReadonlyMap<number, BibleBook>,
  book: number,
  chapter: number,
): BibleReference | undefined {
  const currentBook = bookMap.get(book);
  if (!currentBook) return undefined;

  if (chapter < currentBook.chapters) {
    return { book, chapter: chapter + 1 };
  }

  const nextBook = bookMap.get(book + 1);
  if (nextBook) {
    return { book: book + 1, chapter: 1 };
  }

  return { book: 1, chapter: 1 };
}

/**
 * Get the previous chapter reference using a book lookup map.
 * More efficient when you already have a Map of books.
 */
export function getPrevChapterWithMap(
  bookMap: ReadonlyMap<number, BibleBook>,
  book: number,
  chapter: number,
): BibleReference | undefined {
  if (chapter > 1) {
    return { book, chapter: chapter - 1 };
  }

  const prevBook = bookMap.get(book - 1);
  if (prevBook) {
    return { book: book - 1, chapter: prevBook.chapters };
  }

  const lastBook = BIBLE_BOOKS[BIBLE_BOOKS.length - 1];
  if (lastBook) {
    return { book: lastBook.number, chapter: lastBook.chapters };
  }

  return undefined;
}
