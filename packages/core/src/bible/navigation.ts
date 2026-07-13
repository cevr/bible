/**
 * Bible Navigation Helpers
 *
 * Pure functions for navigating between chapters and books.
 * No Effect dependency - can be used synchronously.
 */

import { getBibleBook } from './canon.js';
import type { Book, ChapterReference } from './model.js';
import { Reference } from './model.js';

/**
 * Get the next chapter reference.
 * Wraps to the next book when at the last chapter.
 * Wraps to Genesis 1 when at Revelation 22.
 */
export function getNextChapter(book: number, chapter: number): ChapterReference | undefined {
  const currentBook = getBibleBook(book);
  if (!currentBook) return undefined;

  // Next chapter in same book
  if (chapter < currentBook.chapters) {
    return Reference.chapter(book, chapter + 1);
  }

  // Move to next book
  const nextBook = getBibleBook(book + 1);
  if (nextBook) {
    return Reference.chapter(book + 1, 1);
  }

  return undefined;
}

/**
 * Get the previous chapter reference.
 * Wraps to the previous book when at chapter 1.
 * Wraps to Revelation 22 when at Genesis 1.
 */
export function getPrevChapter(book: number, chapter: number): ChapterReference | undefined {
  // Previous chapter in same book
  if (chapter > 1) {
    return Reference.chapter(book, chapter - 1);
  }

  // Move to previous book
  const prevBook = getBibleBook(book - 1);
  if (prevBook) {
    return Reference.chapter(book - 1, prevBook.chapters);
  }

  return undefined;
}

/**
 * Get the next chapter reference using a book lookup map.
 * More efficient when you already have a Map of books.
 */
export function getNextChapterWithMap(
  bookMap: ReadonlyMap<number, Book>,
  book: number,
  chapter: number,
): ChapterReference | undefined {
  const currentBook = bookMap.get(book);
  if (!currentBook) return undefined;

  if (chapter < currentBook.chapters) {
    return Reference.chapter(book, chapter + 1);
  }

  const nextBook = bookMap.get(book + 1);
  if (nextBook) {
    return Reference.chapter(book + 1, 1);
  }

  return undefined;
}

/**
 * Get the previous chapter reference using a book lookup map.
 * More efficient when you already have a Map of books.
 */
export function getPrevChapterWithMap(
  bookMap: ReadonlyMap<number, Book>,
  book: number,
  chapter: number,
): ChapterReference | undefined {
  if (chapter > 1) {
    return Reference.chapter(book, chapter - 1);
  }

  const prevBook = bookMap.get(book - 1);
  if (prevBook) {
    return Reference.chapter(book - 1, prevBook.chapters);
  }

  return undefined;
}
