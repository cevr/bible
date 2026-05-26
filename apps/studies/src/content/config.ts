import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { Chapter, ChapterIndexEntry, SeriesMeta } from '../../scripts/schema.ts';

/*
 * Astro content collections backed by the JSON the extractor writes into
 * apps/studies/content/series/<slug>/. The schema is reused verbatim from
 * scripts/schema.ts so the renderer never invents shapes.
 *
 * NOTE: collection names are flat (no slug nesting) because Astro 5 collections
 * are a single registry. Within each collection, IDs encode the series slug.
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

export const collections = {
  seriesMeta,
  seriesChapters,
  chapters,
};
