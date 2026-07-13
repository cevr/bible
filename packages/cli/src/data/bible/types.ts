import { Schema } from 'effect';
import type { Book as CanonicalBook } from '@bible/core/bible';

// Re-export Bible data from core (single source of truth)
export {
  BIBLE_BOOK_ALIASES as BOOK_ALIASES,
  BIBLE_BOOKS as BOOKS,
  getBibleBook as getBook,
  getBibleBookByName as getBookByName,
  formatBibleReference as formatReference,
} from '@bible/core/bible';

// Re-export types with aliases for backwards compatibility
export type Book = CanonicalBook;
export interface ReaderTarget {
  readonly book: number;
  readonly chapter: number;
  readonly verse?: number;
  readonly verseEnd?: number;
}
export type Reference = ReaderTarget;
export interface Position {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
}
export interface Bookmark {
  readonly id: string;
  readonly reference: Reference;
  readonly note?: string;
  readonly createdAt: number;
}
export interface HistoryEntry {
  readonly reference: Reference;
  readonly visitedAt: number;
}
export interface Preferences {
  readonly theme: string;
  readonly displayMode: 'verse' | 'paragraph';
}

// Raw verse from kjv.json (CLI-specific schema for parsing JSON)
// Note: Uses snake_case (book_name) to match the JSON file format
export const VerseSchema = Schema.Struct({
  book_name: Schema.String,
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.Number,
  text: Schema.String,
});

export type Verse = Schema.Schema.Type<typeof VerseSchema>;

// CLI-specific SearchResult that uses the JSON Verse type
export interface SearchResult {
  readonly reference: Reference;
  readonly verse: Verse;
  readonly matchScore: number;
}

// KJV metadata
export const MetadataSchema = Schema.Struct({
  name: Schema.String,
  shortname: Schema.String,
  module: Schema.String,
  year: Schema.String,
  lang: Schema.String,
  lang_short: Schema.String,
});

export type Metadata = Schema.Schema.Type<typeof MetadataSchema>;

// Full KJV data structure
export const KJVDataSchema = Schema.Struct({
  metadata: MetadataSchema,
  verses: Schema.Array(VerseSchema),
});

export type KJVData = Schema.Schema.Type<typeof KJVDataSchema>;

// Synchronous Bible data service interface (for TUI/CLI consumers)
export interface BibleDataSyncService {
  readonly getBooks: () => readonly Book[];
  readonly getBook: (bookNumber: number) => Book | undefined;
  readonly getChapter: (book: number, chapter: number) => Verse[];
  readonly getVerse: (book: number, chapter: number, verse: number) => Verse | undefined;
  readonly searchVerses: (query: string, limit?: number) => SearchResult[];
  readonly parseReference: (ref: string) => Reference | undefined;
  readonly getNextChapter: (book: number, chapter: number) => Reference | undefined;
  readonly getPrevChapter: (book: number, chapter: number) => Reference | undefined;
}
