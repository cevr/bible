/**
 * EGW Commentary Module
 *
 * Provides commentary lookup from EGW Bible Commentary volumes (BC1-BC7).
 */

export type { CommentaryEntry, CommentaryResult } from './types.js';

export { EGWCommentaryService, CommentaryError, type CommentaryServiceError } from './service.js';
