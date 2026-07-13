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
  type BibleVerse,
  type CrossReference,
  type StrongsEntry,
  type VerseWord,
  type MarginNote,
  type ConcordanceHit,
  type VerseSearchResult,
  type StrongsVerse,
  type StrongsChapter,
} from './bible-database.js';

export { BibleCorpus, type BibleCorpusService } from './bible-corpus.js';
export type {
  BibleCorpusStatus,
  KjvAssetFile,
  StrongsWordAsset,
  StrongsVerseAsset,
  StrongsLexiconAsset,
  CrossReferenceAsset,
  CrossReferenceSource,
  MarginNotesAsset,
} from './bible-corpus.js';
