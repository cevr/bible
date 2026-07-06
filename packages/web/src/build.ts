/**
 * Build The Sure Word static site into packages/web/dist/.
 *
 *   bun run src/build.ts
 *
 * Reads the curated handbook markdowns from packages/cli/outputs/studies (see
 * content.ts), renders them with Bun.markdown in the Sure Word design system,
 * and copies the original comparison pages verbatim. The emitted dist/ is a
 * fully static site served by src/server.ts.
 */

import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMPARISONS, STUDIES } from './content.js';
import {
  anchorHeadings,
  comparisonsIndexPage,
  indexPage,
  prepareArticle,
  renderMarkdown,
  splitFrontmatter,
  studyPage,
  STYLES,
} from './render.js';

const log = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const dist = join(here, '..', 'dist');

const countWords = (s: string): number => s.split(/\s+/).filter((w) => w.length > 0).length;

log(`Building The Sure Word → ${dist}`);

await mkdir(dist, { recursive: true });
await Bun.write(join(dist, 'styles.css'), STYLES);

// ---- Studies -----------------------------------------------------------
const built = await Promise.all(
  STUDIES.map(async (meta) => {
    const src = join(repoRoot, meta.file);
    const raw = await Bun.file(src).text();
    const { fm, body } = splitFrontmatter(raw);
    if (fm === '') {
      throw new Error(
        `${meta.file}: no leading frontmatter — the file must start with '---'. ` +
          `Anything before it (e.g. leaked assistant preamble) would be published verbatim.`,
      );
    }
    const words = countWords(body);
    const { html, toc } = anchorHeadings(prepareArticle(renderMarkdown(body)));
    const page = studyPage({ meta, articleHtml: html, toc, words });
    await mkdir(join(dist, 'studies', meta.slug), { recursive: true });
    await Bun.write(join(dist, 'studies', meta.slug, 'index.html'), page);
    log(`  ✓ /studies/${meta.slug}/  (${toc.length} sections, ${Math.round(words / 1000)}k words)`);
    return { slug: meta.slug, words, sections: toc.length };
  }),
);

// ---- Comparisons (copied verbatim — they carry their own styling) -------
await Promise.all(
  COMPARISONS.map(async (comp) => {
    const srcDir = join(repoRoot, comp.srcDir);
    const outDir = join(dist, 'comparisons', comp.outDir);
    await mkdir(outDir, { recursive: true });
    const files = (await readdir(srcDir)).filter((f) => f.endsWith('.html'));
    await Promise.all(files.map((f) => Bun.write(join(outDir, f), Bun.file(join(srcDir, f)))));
    log(`  ✓ /comparisons/${comp.outDir}/  (${files.length} pages, copied verbatim)`);
  }),
);

await Bun.write(join(dist, 'comparisons', 'index.html'), comparisonsIndexPage(COMPARISONS));

// ---- Index + 404 ---------------------------------------------------------
const studiesWithStats = STUDIES.map((meta) => {
  const stats = built.find((b) => b.slug === meta.slug);
  return { ...meta, words: stats?.words ?? 0, sections: stats?.sections ?? 0 };
});
await Bun.write(
  join(dist, 'index.html'),
  indexPage({ studies: studiesWithStats, comparisons: COMPARISONS }),
);
await Bun.write(
  join(dist, '404.html'),
  `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/" /><title>Not found</title><p>Not found — <a href="/">The Sure Word</a></p>`,
);

log(`Done: ${built.length} studies, ${COMPARISONS.length} comparison sets.`);
