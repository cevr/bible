import { describe, expect, test } from 'bun:test';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  StudyGuideChapter,
  StudyGuideChapterIndexEntry,
  StudyGuideMeta,
} from '../scripts/study-guide-schema.ts';
import { ChapterSourceNotFoundError, readChapterSource } from '../src/lib/study-source.ts';

/*
 * Validates the Study Guide content tiers and proves the tier boundary:
 *  - every PUBLIC fixture parses against its schema
 *  - every PRIVATE fixture parses via the server-only accessor
 *  - public and private chapter slugs line up
 *  - the PRIVATE dir is NOT referenced by any Astro content collection
 */

// Anchor to the app root via this file's location so the test passes regardless of
// the cwd it's invoked from (package dir under turbo, or repo root ad hoc).
const ROOT = join(import.meta.dir, '..');
const SERIES = 'dar';
const PUBLIC_DIR = join(ROOT, 'content', 'study-guides', SERIES);
const PRIVATE_DIR = join(ROOT, 'private', SERIES);

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

describe('study guide public tier', () => {
  test('meta.json validates', async () => {
    const meta = await readJson(join(PUBLIC_DIR, 'meta.json'));
    expect(() => StudyGuideMeta.parse(meta)).not.toThrow();
  });

  test('chapters.json index validates', async () => {
    const index = await readJson(join(PUBLIC_DIR, 'chapters.json'));
    expect(() => StudyGuideChapterIndexEntry.array().parse(index)).not.toThrow();
  });

  test('every chapter json validates and correctIndex is in range', async () => {
    const files = (await readdir(join(PUBLIC_DIR, 'chapters'))).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    const datas = await Promise.all(files.map((f) => readJson(join(PUBLIC_DIR, 'chapters', f))));
    for (const data of datas) {
      const chapter = StudyGuideChapter.parse(data);
      for (const q of chapter.questions) {
        expect(q.correctIndex).toBeLessThan(q.options.length);
      }
    }
  });
});

describe('study guide private tier', () => {
  test('every private source validates and has source text', async () => {
    // `_`-prefixed files (e.g. _manifest.json) are export bookkeeping, not sources.
    const files = (await readdir(PRIVATE_DIR)).filter(
      (f) => f.endsWith('.json') && !f.startsWith('_'),
    );
    expect(files.length).toBeGreaterThan(0);
    const slugs = files.map((f) => f.replace(/\.json$/, ''));
    const sources = await Promise.all(
      slugs.map((slug) => readChapterSource(SERIES, slug, { privateRoot: join(ROOT, 'private') })),
    );
    // Key Points are authored later (the export lays down source text with an empty
    // rubric), so we only require the slug + verbatim source text here.
    sources.forEach((source, i) => {
      expect(source.slug).toBe(slugs[i]);
      expect(source.sourceText.length).toBeGreaterThan(0);
    });
  });

  test('readChapterSource throws ChapterSourceNotFoundError for a missing chapter', async () => {
    let caught: unknown;
    try {
      await readChapterSource(SERIES, 'does-not-exist', { privateRoot: join(ROOT, 'private') });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ChapterSourceNotFoundError);
  });
});

describe('tier consistency + boundary', () => {
  test('every public chapter has a private source', async () => {
    // The safety invariant: a published guide must have ground truth to grade
    // against. The reverse (a private source with no guide yet) is normal during
    // authoring, so we check public ⊆ private, not strict equality.
    const publicSlugs = (await readdir(join(PUBLIC_DIR, 'chapters')))
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
    const privateSlugs = new Set(
      (await readdir(PRIVATE_DIR))
        .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
        .map((f) => f.replace(/\.json$/, '')),
    );
    const orphans = publicSlugs.filter((slug) => !privateSlugs.has(slug));
    expect(orphans).toEqual([]);
  });

  test('no content collection loader points at the private dir', async () => {
    const config = await readFile(join(ROOT, 'src', 'content.config.ts'), 'utf8');
    // The word "private" may appear in comments; what must never happen is a
    // loader (file(...) or glob base) resolving into the private tier.
    expect(config).not.toMatch(/\bfile\(\s*['"][^'"]*\bprivate\//);
    expect(config).not.toMatch(/\bbase:\s*['"][^'"]*\bprivate\//);
    // Defensively: the registered collections list must not include a private one.
    const exported = config.slice(config.indexOf('export const collections'));
    expect(exported.toLowerCase()).not.toContain('private');
  });
});
