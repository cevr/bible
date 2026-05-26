import { getEntry } from 'astro:content';

/*
 * Wrappers around getEntry that turn the "entry missing" case into an explicit
 * build-time error instead of a silent undefined. The extractor commits both
 * collections together, so a missing entry means the JSON tree is out of sync
 * with the renderer — we want that to fail loud at build time.
 */

export async function getSeriesMeta(slug: string) {
  const entry = await getEntry('seriesMeta', slug);
  if (!entry) throw new Error(`seriesMeta entry not found: ${slug}`);
  return entry.data;
}

export async function getChapter(slug: string) {
  const entry = await getEntry('chapters', slug);
  if (!entry) throw new Error(`chapter entry not found: ${slug}`);
  return entry.data;
}
