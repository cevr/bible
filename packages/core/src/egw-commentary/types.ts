/**
 * EGW Commentary Types
 *
 * Types for Bible commentary from EGW writings.
 */

import type { VerseReference } from '../bible/model.js';

/**
 * A single commentary entry for a Bible verse
 */
export interface CommentaryEntry {
  /** EGW reference code (e.g., "1BC 1111.2") */
  readonly refcode: string;
  /** Book code (e.g., "1BC") */
  readonly bookCode: string;
  /** Book title (e.g., "Bible Commentary Volume 1") */
  readonly bookTitle: string;
  /**
   * The `books.book_author` value behind this paragraph.
   *
   * Carried because `getCommentary` is a reverse lookup over the *whole*
   * library rather than the commentary volumes its name suggests — Dan 7:25
   * answers with 431 rows spanning Matthew Henry, Strong's and modern
   * secondary works. A caller scoping the result to the White Estate (§8.4)
   * needs the same author column §6.4's `CorpusScope` filters on, and the
   * reverse lookup's own join already visits it.
   */
  readonly bookAuthor: string;
  /** Commentary text content */
  readonly content: string;
  /** Publication order in the original book */
  readonly puborder: number;
}

/**
 * Commentary lookup result
 */
export interface CommentaryResult {
  /** The verse being commented on */
  readonly verse: VerseReference;
  /** Commentary entries for this verse */
  readonly entries: readonly CommentaryEntry[];
}
