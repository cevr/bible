/**
 * Core Types
 *
 * Shared type definitions for the bible packages.
 */

// Branded ID types - schemas and type aliases
export {
  BibleBookNumber,
  BibleChapter,
  BibleVerse,
  bibleBookNumber,
  bibleChapter,
  bibleVerse,
  EGWBookId,
  egwBookId,
  EGWParagraphId,
  egwParagraphId,
  EGWRefCode,
  egwRefCode,
} from './ids.js';

// Re-export types separately for convenience
export type { BibleBookNumber as BibleBookNumberType } from './ids.js';
export type { BibleChapter as BibleChapterType } from './ids.js';
export type { BibleVerse as BibleVerseType } from './ids.js';
export type { EGWBookId as EGWBookIdType } from './ids.js';
export type { EGWParagraphId as EGWParagraphIdType } from './ids.js';
export type { EGWRefCode as EGWRefCodeType } from './ids.js';
