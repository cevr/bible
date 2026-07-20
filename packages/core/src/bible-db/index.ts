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
  type VerseSearchOptions,
  type VerseSearchWindow,
  type StrongsVerse,
  type StrongsChapter,
} from './bible-database.js';

export { BibleCorpus, type BibleCorpusService } from './bible-corpus.js';
export {
  BibleCorpusArchive,
  decodeBibleCorpusArchive,
  KjvAssetFile,
  StrongsWordAsset,
  StrongsVerseAsset,
  StrongsLexiconAsset,
  StrongsLexicon,
  CrossReferenceAsset,
  MarginNotesAsset,
  TopicalReferenceAsset,
} from './archive.js';
export type { BibleCorpusStatus, CrossReferenceSource } from './bible-corpus.js';
