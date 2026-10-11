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
 * Verse ID within a hymn. Stanzas count up from 0; refrains count down from
 * -1 (-1 is the first refrain, -2 a second). The hymnal stores 199 refrains,
 * so a non-negative bound made every hymn with a chorus undecodable.
 */
export const VerseId = Schema.Finite.pipe(Schema.check(Schema.isInt()), Schema.brand('VerseId'));
export type VerseId = typeof VerseId.Type;
