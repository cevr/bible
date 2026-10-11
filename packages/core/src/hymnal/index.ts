/**
 * Hymnal Module
 *
 * Provides access to the SDA Hymnal (920 hymns, 68 categories).
 */

export { HymnalService } from './service.js';
export { isRefrain, type HymnVerse } from './schemas.js';

// Re-export ID types
export { CategoryId, HymnId } from '../types/ids.js';
