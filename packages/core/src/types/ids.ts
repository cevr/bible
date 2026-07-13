/**
 * Branded Types for Entity IDs
 *
 * These branded types help catch type mismatches at compile time.
 * For example, passing a book ID where a chapter number is expected.
 */

import { Schema } from 'effect';

// ============================================================================
// EGW Types
// ============================================================================

/**
 * EGW Book ID (numeric identifier)
 */
export const EGWBookId = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0)),
  Schema.brand('EGWBookId'),
);
export type EGWBookId = typeof EGWBookId.Type;

/**
 * EGW Paragraph ID (string identifier)
 */
export const EGWParagraphId = Schema.String.pipe(Schema.brand('EGWParagraphId'));
export type EGWParagraphId = typeof EGWParagraphId.Type;

/**
 * EGW Reference code (e.g., "DA 25.1")
 */
export const EGWRefCode = Schema.String.pipe(Schema.brand('EGWRefCode'));
export type EGWRefCode = typeof EGWRefCode.Type;

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
 * Create an EGW book ID from a raw number.
 */
export const egwBookId = (n: number): EGWBookId => Schema.decodeSync(EGWBookId)(n);

/**
 * Create an EGW paragraph ID from a raw string.
 */
export const egwParagraphId = (s: string): EGWParagraphId => Schema.decodeSync(EGWParagraphId)(s);

/**
 * Create an EGW reference code from a raw string.
 */
export const egwRefCode = (s: string): EGWRefCode => Schema.decodeSync(EGWRefCode)(s);

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
