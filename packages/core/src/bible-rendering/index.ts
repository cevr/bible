/**
 * Bible Rendering Module
 *
 * Framework-agnostic segmentation engine + formatting helpers shared by
 * every Bible-reading UI and command-line formatter. The output is
 * a typed `TextSegment[]` array; each consumer maps the variants to its
 * own UI primitives.
 *
 * See `segments.ts` for the segmentation pipeline and `margin-notes.ts`
 * for footnote-label / footnote-prefix helpers.
 */

export type {
  TextSegment,
  MarginNoteAnchor,
  PhraseSpanInput,
  PhraseLayer,
  SegmentLayer,
  SegmentPhraseSpans,
} from './segments.js';
export {
  applyItalicSegments,
  applyPhraseSegments,
  applyRedLetterSegments,
  applySearchHighlights,
  renderVerseSegments,
  SEGMENT_APPLICATION_ORDER,
  segmentVerseText,
} from './segments.js';
export { noteLabel, formatNoteType } from './margin-notes.js';
