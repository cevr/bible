/**
 * Hymnal Module
 *
 * Provides access to the SDA Hymnal (920 hymns, 68 categories).
 */

// Database layer
export { HymnalDatabase, HymnalDatabaseError, type HymnalDatabaseService } from './database.js';

// Service layer
export { HymnalService, HymnNotFoundError, type HymnalServiceShape } from './service.js';

// Schemas and types
export { Category, Hymn, HymnSummary, HymnVerse } from './schemas.js';

// AI tool
export { createHymnalTool } from './tool.js';

// Re-export ID types
export { CategoryId, HymnId, VerseId, categoryId, hymnId, verseId } from '../types/ids.js';
