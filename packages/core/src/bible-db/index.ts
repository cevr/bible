/**
 * Bible Database Module
 *
 * Exports the BibleDatabase service and all related types for accessing
 * Bible data stored in SQLite.
 */

export {
  BibleDatabase,
  type BibleDatabaseService,
  type BibleDatabaseError,
  // Row schemas (for internal use / sync scripts)
  BookRow,
  VersionRow,
  VerseRow,
  CrossRefRow,
  StrongsRow,
  VerseWordRow,
  StrongsVerseRow,
  MarginNoteRow,
  // API types (for external consumption)
  type BibleBook,
  type BibleVerse,
  type CrossReference,
  type StrongsEntry,
  type VerseWord,
  type MarginNote,
  type ConcordanceResult,
  type VerseSearchResult,
} from './bible-database.js';
