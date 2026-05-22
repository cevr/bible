/**
 * Bible Cross References Module
 *
 * Classification taxonomy + shared types for biblical cross references.
 * Framework-agnostic — every Bible-reading UI (web React, desktop Solid,
 * future CLI summaries) consumes the same types and abbreviations.
 *
 * Presentational tokens (colors, badge styles) intentionally live in each
 * client because they are tied to that client's design system.
 */

export { CROSS_REF_TYPES, CROSS_REF_ABBREVIATIONS, CROSS_REF_LABELS } from './types.js';
export type {
  CrossRefType,
  CatalogCrossReference,
  UserCrossReference,
  ClassifiedCrossReference,
} from './types.js';
