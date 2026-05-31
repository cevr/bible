import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { Chapter, ChapterIndexEntry, SeriesMeta } from '../scripts/schema.ts';
import {
  StudyGuideChapter,
  StudyGuideChapterIndexEntry,
  StudyGuideMeta,
} from '../scripts/study-guide-schema.ts';

/*
 * Astro content collections backed by the JSON under apps/studies/content/. The
 * schemas are reused verbatim from scripts/ so the renderer never invents shapes.
 *
 * NOTE: collection names are flat (no slug nesting) because Astro collections
 * are a single registry. Within each collection, IDs encode the series slug.
 *
 * TIER BOUNDARY: only PUBLIC content is registered here. A Study Guide chapter's
 * PRIVATE tier (verbatim Source Text + Key Points, under apps/studies/private/)
 * is deliberately NOT a collection — it must never reach the browser. The grading
 * endpoint reads it server-side via fs. See scripts/study-guide-schema.ts.
 */

const seriesMeta = defineCollection({
  loader: file('content/series/bohr-vs-millers-rules/meta.json', {
    parser: (text) => [{ id: 'bohr-vs-millers-rules', ...JSON.parse(text) }],
  }),
  schema: SeriesMeta,
});

const seriesChapters = defineCollection({
  loader: file('content/series/bohr-vs-millers-rules/chapters.json', {
    parser: (text) => {
      const parsed = ChapterIndexEntry.array().parse(JSON.parse(text));
      return parsed.map((row) => ({ id: row.slug, ...row }));
    },
  }),
  schema: ChapterIndexEntry,
});

const chapters = defineCollection({
  loader: glob({
    pattern: '*.json',
    base: 'content/series/bohr-vs-millers-rules/chapters',
  }),
  schema: Chapter,
});

// --- Study Guide series (PUBLIC tier only) ---------------------------------
// The DAR pilot. Chapter source text + key points live in the private tier and
// are intentionally absent here.

const studyGuideMeta = defineCollection({
  loader: file('content/study-guides/dar/meta.json', {
    parser: (text) => [{ id: 'dar', ...JSON.parse(text) }],
  }),
  schema: StudyGuideMeta,
});

const studyGuideChapterIndex = defineCollection({
  loader: file('content/study-guides/dar/chapters.json', {
    parser: (text) => {
      const parsed = StudyGuideChapterIndexEntry.array().parse(JSON.parse(text));
      return parsed.map((row) => ({ id: row.slug, ...row }));
    },
  }),
  schema: StudyGuideChapterIndexEntry,
});

const studyGuideChapters = defineCollection({
  loader: glob({
    pattern: '*.json',
    base: 'content/study-guides/dar/chapters',
  }),
  schema: StudyGuideChapter,
});

export const collections = {
  seriesMeta,
  seriesChapters,
  chapters,
  studyGuideMeta,
  studyGuideChapterIndex,
  studyGuideChapters,
};
