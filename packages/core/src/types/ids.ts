/**
 * Branded Types for Entity IDs
 *
 * These branded types help catch type mismatches at compile time.
 * For example, passing a book ID where a chapter number is expected.
 */

import { Schema } from 'effect';

// ============================================================================
// Hymnal Types
// ============================================================================

/**
 * SDA Hymnal hymn number (1-920)
 */
export const HymnId = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 920 })),
  Schema.brand('HymnId'),
);
export type HymnId = typeof HymnId.Type;

/**
 * Hymnal category ID (positive integer)
 */
export const CategoryId = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0)),
  Schema.brand('CategoryId'),
);
export type CategoryId = typeof CategoryId.Type;

/**
 * Verse ID within a hymn (0-indexed)
 */
export const VerseId = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  Schema.brand('VerseId'),
);
export type VerseId = typeof VerseId.Type;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a hymn ID from a raw number.
 * Validates that the number is between 1 and 920.
 */
export const hymnId = (n: number): HymnId => Schema.decodeSync(HymnId)(n);

/**
 * Create a category ID from a raw number.
 */
export const categoryId = (n: number): CategoryId => Schema.decodeSync(CategoryId)(n);

/**
 * Create a verse ID from a raw number.
 */
export const verseId = (n: number): VerseId => Schema.decodeSync(VerseId)(n);
