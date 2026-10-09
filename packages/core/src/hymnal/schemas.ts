/**
 * Hymnal Schema Types
 *
 * Domain models for hymnal data using Schema.Class for serialization.
 */

import { Schema } from 'effect';

import { CategoryId, HymnId, VerseId } from '../types/ids.js';

// ============================================================================
// Domain Models
// ============================================================================

/**
 * A single verse within a hymn: a stanza, or a refrain (negative id)
 */
export class HymnVerse extends Schema.Class<HymnVerse>('HymnVerse')({
  id: VerseId,
  text: Schema.String,
}) {}

export const isRefrain = (verse: HymnVerse): boolean => verse.id < 0;

/** A hymn's first sung line, from its opening stanza rather than its refrain,
 *  cut to 60 characters for summaries. */
export const hymnFirstLine = (verses: readonly HymnVerse[]): string => {
  const opening = verses.find((verse) => !isRefrain(verse)) ?? verses[0];
  const line = opening?.text.split('\n')[0]?.trim() ?? '';
  if (line.length > 60) return `${line.slice(0, 60)}...`;
  return line;
};

/**
 * A hymn from the SDA Hymnal
 */
export class Hymn extends Schema.Class<Hymn>('Hymn')({
  id: HymnId,
  name: Schema.String,
  category: Schema.String,
  categoryId: CategoryId,
  verses: Schema.Array(HymnVerse),
}) {}

/**
 * A category of hymns
 */
export class Category extends Schema.Class<Category>('Category')({
  id: CategoryId,
  name: Schema.String,
}) {}

/**
 * Summary of a hymn (for search results, less verbose)
 */
export class HymnSummary extends Schema.Class<HymnSummary>('HymnSummary')({
  id: HymnId,
  name: Schema.String,
  category: Schema.String,
  firstLine: Schema.String,
}) {}

// ============================================================================
// Database Row Types (internal)
// ============================================================================

/**
 * Raw hymn row from SQLite
 */
export const HymnRow = Schema.Struct({
  id: Schema.Finite,
  name: Schema.String,
  category: Schema.String,
  category_id: Schema.Finite,
  verses: Schema.String, // JSON array
});
export type HymnRow = Schema.Schema.Type<typeof HymnRow>;

/**
 * Raw category row from SQLite
 */
export const CategoryRow = Schema.Struct({
  id: Schema.Finite,
  name: Schema.String,
});
export type CategoryRow = Schema.Schema.Type<typeof CategoryRow>;
