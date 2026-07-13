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
  type StrongsWord,
  type StrongsVersePayload,
  type StrongsChapterPayload,
  type StrongsLexiconEntry,
  type StrongsConcordanceHit,
  type CrossReferenceRow,
  type MarginNoteRow,
} from './bible-database.js';

export { BibleCatalog, type BibleCatalogService } from './bible-catalog.js';
export type {
  BibleCatalogStatus,
  KjvAssetFile,
  StrongsWordAsset,
  StrongsVerseAsset,
  StrongsLexiconAsset,
  CrossReferenceCatalog,
  CrossReferenceSource,
  MarginNotesCatalog,
} from './bible-catalog.js';
