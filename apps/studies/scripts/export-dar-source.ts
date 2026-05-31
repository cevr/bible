#!/usr/bin/env bun
/*
 * Export the verbatim Source Text for each DAR chapter from the local EGW
 * paragraph DB (~/.bible/egw-paragraphs.db, book_code DAR) into the PRIVATE tier
 * (apps/studies/private/dar/<slug>.json), plus a manifest the authoring workflow
 * consumes. See docs/adr/0003.
 *
 * Verbatim and mechanical: chapter boundaries come from is_chapter_heading rows
 * ordered by puborder; a chapter's body is every paragraph between its heading and
 * the next heading. DAR restarts chapter numbering at the Revelation section, so we
 * slug Daniel chapters dan-N and Revelation chapters rev-N.
 *
 * The written ChapterSource has an EMPTY keyPoints array — Key Points are authored
 * later by the workflow. This script only lays down the ground-truth source text.
 *
 * Usage: bun run scripts/export-dar-source.ts [--db <path>]
 */

import { Database } from 'bun:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '..');
const PRIVATE_DIR = join(APP_ROOT, 'private', 'dar');
const MANIFEST_PATH = join(PRIVATE_DIR, '_manifest.json');

const dbFlagIndex = process.argv.indexOf('--db');
const DB_PATH =
  dbFlagIndex !== -1
    ? process.argv[dbFlagIndex + 1]
    : join(homedir(), '.bible', 'egw-paragraphs.db');

const BOOK_CODE = 'DAR';
// puborder of the heading that begins the Revelation section. Everything at/after
// this is Revelation; before it, Daniel.
const REVELATION_SECTION_PUBORDER = 1090;

interface HeadingRow {
  puborder: number;
  refcode_short: string;
  content_text: string;
}

interface ParagraphRow {
  content_text: string;
}

interface ManifestEntry {
  slug: string;
  section: 'daniel' | 'revelation';
  chapterNumber: number;
  title: string;
  ref: string;
  startRefcode: string;
  paragraphCount: number;
  charCount: number;
}

function parseChapterTitle(headingText: string): { chapterNumber: number; title: string } | null {
  // e.g. "Chapter 1 — Daniel in Captivity" (em dash or hyphen).
  const match = headingText.match(/^Chapter\s+(\d+)\s*[—–-]\s*(.+)$/u);
  if (!match) return null;
  return { chapterNumber: Number(match[1]), title: match[2].trim() };
}

function main(): void {
  const db = new Database(DB_PATH, { readonly: true });

  const book = db
    .query<{ book_id: number }, [string]>('SELECT book_id FROM books WHERE book_code = ?')
    .get(BOOK_CODE);
  if (!book) {
    console.error(`Book ${BOOK_CODE} not found in ${DB_PATH}. Run \`bible egw download\` first.`);
    process.exit(1);
  }

  // All chapter headings in order — both real chapters and front-matter.
  const headings = db
    .query<HeadingRow, [number]>(
      `SELECT puborder, refcode_short, content_text
         FROM paragraphs
        WHERE book_id = ? AND is_chapter_heading = 1
        ORDER BY puborder`,
    )
    .all(book.book_id);

  const bodyQuery = db.query<ParagraphRow, [number, number, number]>(
    `SELECT content_text
       FROM paragraphs
      WHERE book_id = ? AND puborder > ? AND puborder < ?
        AND is_chapter_heading = 0
      ORDER BY puborder`,
  );

  mkdirSync(PRIVATE_DIR, { recursive: true });
  const manifest: ManifestEntry[] = [];

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const parsed = parseChapterTitle(heading.content_text);
    if (!parsed) continue; // skip front-matter (Preface, Contents, etc.)

    const section: ManifestEntry['section'] =
      heading.puborder >= REVELATION_SECTION_PUBORDER ? 'revelation' : 'daniel';
    const prefix = section === 'revelation' ? 'rev' : 'dan';
    const slug = `${prefix}-${parsed.chapterNumber}`;

    // Body runs from this heading to the next heading of ANY kind.
    const next = headings[i + 1];
    const upperBound = next ? next.puborder : Number.MAX_SAFE_INTEGER;
    const paragraphs = bodyQuery.all(book.book_id, heading.puborder, upperBound);
    const sourceText = paragraphs
      .map((p) => p.content_text.trim())
      .filter((t) => t.length > 0)
      .join('\n\n');

    if (sourceText.length === 0) {
      console.warn(`! ${slug} (${heading.content_text}) has no body text — skipping.`);
      continue;
    }

    const ref = `DAR — ${section === 'revelation' ? 'Revelation' : 'Daniel'} ch. ${parsed.chapterNumber}: ${parsed.title}`;
    const chapterSource = { slug, sourceText, keyPoints: [] as never[] };
    writeFileSync(join(PRIVATE_DIR, `${slug}.json`), `${JSON.stringify(chapterSource, null, 2)}\n`);

    manifest.push({
      slug,
      section,
      chapterNumber: parsed.chapterNumber,
      title: parsed.title,
      ref,
      startRefcode: heading.refcode_short,
      paragraphCount: paragraphs.length,
      charCount: sourceText.length,
    });
  }

  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  db.close();

  const daniel = manifest.filter((m) => m.section === 'daniel').length;
  const revelation = manifest.filter((m) => m.section === 'revelation').length;
  console.log(
    `✓ Exported ${manifest.length} DAR chapters (${daniel} Daniel, ${revelation} Revelation)`,
  );
  console.log(`  Source files: ${PRIVATE_DIR}/<slug>.json`);
  console.log(`  Manifest:     ${MANIFEST_PATH}`);
  for (const m of manifest) {
    console.log(`  ${m.slug.padEnd(8)} ${String(m.paragraphCount).padStart(3)}¶  ${m.title}`);
  }
}

main();
