/**
 * Bible data types for the web application.
 *
 * Re-exports from @bible/core for consistency across packages.
 * Verse and SearchResult types now come from @bible/api.
 */

import type { BibleBook, BibleReference } from '@bible/core/bible-reader';

// Re-export Bible data from core (single source of truth)
export {
  BIBLE_BOOK_ALIASES as BOOK_ALIASES,
  BIBLE_BOOKS as BOOKS,
  getBibleBook as getBook,
  getBibleBookByName as getBookByName,
  formatBibleReference as formatReference,
} from '@bible/core/bible-reader';

// Re-export types with aliases for backwards compatibility
export type Book = BibleBook;
export type Reference = BibleReference;

// Re-export API types for convenience
export type { Verse, SearchResult, ChapterResponse } from '@bible/api';

/** Convert a book name to a URL-safe slug (e.g. "1 Samuel" → "1-samuel"). */
export function toBookSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}
