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
export const HymnId = Schema.Finite.pipe(
  Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 920 })),
  Schema.brand('HymnId'),
);
export type HymnId = typeof HymnId.Type;

/**
 * Hymnal category ID (positive integer)
 */
export const CategoryId = Schema.Finite.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0)),
  Schema.brand('CategoryId'),
);
export type CategoryId = typeof CategoryId.Type;

/**
 * Verse ID within a hymn (0-indexed)
 */
export const VerseId = Schema.Finite.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  Schema.brand('VerseId'),
);
export type VerseId = typeof VerseId.Type;
