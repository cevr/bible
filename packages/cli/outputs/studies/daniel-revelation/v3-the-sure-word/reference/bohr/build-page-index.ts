#!/usr/bin/env bun
/**
 * Build `bohr-page-index.json` — one-off utility.
 *
 * For each Bohr .txt (produced by `pdftotext -layout`), split on form-feeds
 * (`\f`) to identify PDF page boundaries, then walk each page chunk to
 * record:
 *   - the .txt line number where the page STARTS (1-based)
 *   - the PDF page number (parsed from any `Page N of XXX` running footer,
 *     otherwise inferred sequentially)
 *
 * Output: bohr-page-index.json (pretty-printed, 2-space indent).
 *
 * Run from this directory:
 *   bun run build-page-index.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface PageMarker {
  txt_line: number;
  pdf_page: number;
  inferred?: true;
}

interface FileIndex {
  total_pages: number;
  total_lines: number;
  page_markers: PageMarker[];
  /** Form-feed count from the raw file — sanity check for the caller. */
  form_feed_count: number;
  /** PDF pages whose number had to be inferred (no `Page N of XXX` marker). */
  inferred_page_numbers: number[];
}

const HERE = dirname(fileURLToPath(import.meta.url));

const FILES = [
  'bohr-studies-on-daniel-11.txt',
  'bohr-great-prophecies-daniel-revelation.txt',
  'bohr-seven-churches.txt',
  'bohr-seven-seals.txt',
  'bohr-seven-trumpets.txt',
  'bohr-close-of-probation-rev15-22.txt',
];

// Matches running-footer page markers like:
//   "... | Page 2 of 267"
//   "... | Page 17 of 379"
// Captures (pdf_page, total_pages).
const PAGE_MARKER_RE = /Page\s+(\d+)\s+of\s+(\d+)/i;

function buildIndexForFile(filePath: string): FileIndex {
  const raw = readFileSync(filePath, 'utf8');
  // Match `wc -l` semantics: count `\n` characters. Files emitted by
  // `pdftotext -layout` end with `\n\f`, so the trailing `\f` is not a line.
  const totalLines = (raw.match(/\n/g) ?? []).length;
  const formFeedCount = (raw.match(/\f/g) ?? []).length;

  // pdftotext -layout emits a `\f` AFTER each page's text. We treat each
  // \f-separated chunk as one PDF page. The file always ends with `\f`, so
  // splitting yields one trailing empty chunk we discard.
  const chunks = raw.split('\f');
  if (chunks[chunks.length - 1] === '') chunks.pop();

  const markers: PageMarker[] = [];
  const inferred: number[] = [];

  let currentLine = 1; // 1-based line where the current chunk starts
  let lastSeenPage = 0;
  let totalPagesFromMarkers = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    let pdfPage: number | null = null;

    // Look for the FIRST `Page N of XXX` marker inside this chunk. PDFs use
    // a running footer at the END of each page, but the regex is tolerant —
    // it matches anywhere in the chunk.
    for (const line of chunk.split('\n')) {
      const m = line.match(PAGE_MARKER_RE);
      if (m) {
        pdfPage = Number(m[1]);
        totalPagesFromMarkers = Math.max(totalPagesFromMarkers, Number(m[2]));
        break;
      }
    }

    const marker: PageMarker = {
      txt_line: currentLine,
      pdf_page: pdfPage ?? lastSeenPage + 1,
    };
    if (pdfPage === null) {
      marker.inferred = true;
      inferred.push(marker.pdf_page);
    }
    markers.push(marker);
    lastSeenPage = marker.pdf_page;

    // Advance currentLine past this chunk + the `\f` that follows.
    // The `\f` itself is NOT on its own line — it sits between two
    // newline-terminated lines. So the line count of this chunk equals
    // the number of `\n`s inside it. The next chunk's first line is
    // (currentLine + lineCountOfThisChunk).
    const newlineCount = (chunk.match(/\n/g) ?? []).length;
    currentLine += newlineCount;
  }

  return {
    total_pages: totalPagesFromMarkers || markers.length,
    total_lines: totalLines,
    page_markers: markers,
    form_feed_count: formFeedCount,
    inferred_page_numbers: inferred,
  };
}

const index: Record<string, FileIndex> = {};
for (const name of FILES) {
  const path = join(HERE, name);
  index[name] = buildIndexForFile(path);
}

const outPath = join(HERE, 'bohr-page-index.json');
writeFileSync(outPath, JSON.stringify(index, null, 2) + '\n', 'utf8');

// Summary table — written to stderr so stdout could be redirected if desired.
console.error(
  '\nfile                                                 ff   pages-marker  chunks  lines   inferred',
);
console.error('-'.repeat(105));
for (const name of FILES) {
  const idx = index[name];
  const ff = String(idx.form_feed_count).padStart(4);
  const pm = String(idx.total_pages).padStart(12);
  const ch = String(idx.page_markers.length).padStart(6);
  const ln = String(idx.total_lines).padStart(6);
  const inf = String(idx.inferred_page_numbers.length).padStart(8);
  console.error(`${name.padEnd(52)} ${ff} ${pm} ${ch} ${ln} ${inf}`);
}
console.error(`\nWrote ${outPath}`);
