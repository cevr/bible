/**
 * Bible Rendering Module
 *
 * Framework-agnostic segmentation engine + formatting helpers shared by
 * every Bible-reading UI (web React, desktop Solid, CLI, …). The output is
 * a typed `TextSegment[]` array; each consumer maps the variants to its
 * own UI primitives.
 *
 * See `segments.ts` for the segmentation pipeline and `margin-notes.ts`
 * for footnote-label / footnote-prefix helpers.
 */

export type { TextSegment, MarginNoteAnchor } from './segments.js';
export {
  applyItalicSegments,
  applyRedLetterSegments,
  applySearchHighlights,
  segmentVerseText,
} from './segments.js';
export { noteLabel, formatNoteType } from './margin-notes.js';
