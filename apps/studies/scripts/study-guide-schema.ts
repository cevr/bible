import { z } from 'zod';

/*
 * Schemas for an interactive Study Guide series (e.g. the DAR pilot), distinct from
 * the bohr-vs-millers-rules *audit* series in ./schema.ts. See apps/studies/CONTEXT.md
 * for the glossary and docs/adr/0003 for the DAR pilot decisions.
 *
 * Content is split into two TIERS, and the split is a hard boundary:
 *
 *   PUBLIC  — ships to the browser via an Astro content collection. The
 *             multiple-choice Quiz (with answers + explanations, graded
 *             client-side), the voice prompt, and chapter metadata.
 *
 *   PRIVATE — read ONLY by the server-side grading endpoint (via fs); never put
 *             into a content collection or otherwise serialized into a page. The
 *             verbatim Source Text and the Key Points (the recall rubric). Keeping
 *             these server-only is what makes the Voice Reflection a genuine
 *             recall assessment — the learner reflects blind to the rubric.
 *
 * The two tiers share a chapter `slug`; the grader joins them by it.
 */

// ---------------------------------------------------------------------------
// PUBLIC tier — ships to the browser
// ---------------------------------------------------------------------------

/** One multiple-choice question. Authored with its answer + explanation, because
 * the Quiz is graded client-side (answers ship). */
export const QuizQuestion = z.object({
  /** Stable id, unique within the chapter (used as React/DOM key and for storage). */
  id: z.string(),
  /** The question text. */
  stem: z.string(),
  /** Answer options, in display order. At least two. */
  options: z.array(z.string()).min(2),
  /** Index into `options` of the correct answer. */
  correctIndex: z.number().int().nonnegative(),
  /** Shown after answering — why the correct option is correct. */
  explanation: z.string(),
});
export type QuizQuestion = z.infer<typeof QuizQuestion>;

/** The public, browser-facing half of a Study Guide chapter. */
export const StudyGuideChapter = z.object({
  /** Chapter slug; shared with the private ChapterSource. */
  slug: z.string(),
  /** Human reference for the chapter (e.g. "DAR — The Prophetic Word"). */
  ref: z.string(),
  /** Display title. */
  title: z.string(),
  /** 1-based position of this chapter within the series. */
  order: z.number().int().positive(),
  /** The prompt shown before the Voice Reflection (what to talk about). */
  voicePrompt: z.string(),
  /** The multiple-choice quiz. */
  questions: z.array(QuizQuestion),
});
export type StudyGuideChapter = z.infer<typeof StudyGuideChapter>;

/** Series-level metadata for a Study Guide. */
export const StudyGuideMeta = z.object({
  slug: z.string(),
  title: z.string(),
  subtitle: z.string(),
  eyebrow: z.string(),
  lede: z.string(),
});
export type StudyGuideMeta = z.infer<typeof StudyGuideMeta>;

/** Lightweight index row for listing a series' chapters. */
export const StudyGuideChapterIndexEntry = z.object({
  slug: z.string(),
  ref: z.string(),
  title: z.string(),
  order: z.number().int().positive(),
  questionCount: z.number().int().nonnegative(),
});
export type StudyGuideChapterIndexEntry = z.infer<typeof StudyGuideChapterIndexEntry>;

// ---------------------------------------------------------------------------
// PRIVATE tier — server-only, never shipped to the browser
// ---------------------------------------------------------------------------

/** One authored Key Point: a must-cover idea, the recall rubric the Grader checks
 * the Voice Reflection against. */
export const KeyPoint = z.object({
  /** Stable id, unique within the chapter (used in Grade results). */
  id: z.string(),
  /** Short label naming the idea (revealed only in Grade results). */
  label: z.string(),
  /** Fuller, source-grounded statement of the point the Grader uses to judge coverage. */
  detail: z.string(),
});
export type KeyPoint = z.infer<typeof KeyPoint>;

/** The private, server-only half of a Study Guide chapter: ground truth + rubric.
 * MUST NOT be placed in an Astro content collection or sent to the client. */
export const ChapterSource = z.object({
  /** Chapter slug; shared with the public StudyGuideChapter. */
  slug: z.string(),
  /** Verbatim chapter prose — the ground truth a Voice Reflection is graded against. */
  sourceText: z.string(),
  /** The recall rubric. */
  keyPoints: z.array(KeyPoint),
});
export type ChapterSource = z.infer<typeof ChapterSource>;
