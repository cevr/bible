/**
 * Bible Database Module
 *
 * Exports the BibleDatabase service and all related types for accessing
 * Bible data stored in SQLite.
 */

export {
  BibleDatabase,
  BibleDataIntegrityError,
  type BibleDatabaseService,
  type BibleDatabaseError,
  type BibleBook,
  type BibleVerse,
  type CrossReference,
  type StrongsEntry,
  type VerseWord,
  type MarginNote,
  type ConcordanceResult,
  type VerseSearchResult,
} from './bible-database.js';
