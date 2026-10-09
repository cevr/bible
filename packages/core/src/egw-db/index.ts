/**
 * EGW Paragraph Database - Main Export
 *
 * This module provides a service for storing and retrieving EGW paragraphs
 * in a local SQLite database, avoiding repeated HTTP calls to the EGW API.
 */

export { EGWParagraphDatabase, paragraphIdentity } from './book-database.js';
export type { BookRow, EGWParagraphDatabaseService } from './book-database.js';
