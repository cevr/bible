/**
 * EGW Paragraph Database - Main Export
 *
 * This module provides a service for storing and retrieving EGW paragraphs
 * in a local SQLite database, avoiding repeated HTTP calls to the EGW API.
 */

export { EGWParagraphDatabase, ParagraphDataIntegrityError, SyncStatus } from './book-database.js';
export { isChapterHeading } from '../egw/parse.js';
export type {
  BookRow,
  ParagraphDatabaseError,
  ParagraphRow,
  SyncStatusRow,
} from './book-database.js';
