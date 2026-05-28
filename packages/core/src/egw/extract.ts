/**
 * Extract Bible scripture references from EGW paragraphs.
 *
 * EGW paragraphs may contain inline `ScriptureRef` AST nodes (rendered as
 * `<span class="egwlink_bible" title="Genesis 3:1" data-link="1965.119">`).
 * The `paragraph_bible_refs` table joins those refs back to paragraphs, so
 * the renderer can ask "show me EGW commentary on Genesis 3:1" without an
 * FTS scan.
 *
 * The indexer is the natural call site: it already has the decoded paragraphs
 * in hand and writes them to `paragraphs`; this extractor produces the rows
 * that need to be written to `paragraph_bible_refs` in the same transaction.
 *
 * Title parsing uses `parseBibleQuery`, which is canonical for the rest of the
 * codebase (search bar, reference lookup). If a title fails to parse (e.g.,
 * a non-English title we don't yet handle), we skip — better to drop a single
 * reference than to fail the whole index pass.
 */

import { Option } from 'effect';

import { parseBibleQuery } from '../bible-reader/index.js';
import type { Node } from './ast.js';
import type { Paragraph } from './schemas.js';

export interface ExtractedBibleRef {
  readonly bookId: number;
  readonly refCode: string;
  readonly bibleBook: number;
  readonly bibleChapter: number;
  /** `null` when the reference targets a whole chapter (e.g. "Genesis 3"). */
  readonly bibleVerse: number | null;
}

/** Same refCode derivation as `paragraphToRow` in book-database.ts. Keep in
 *  sync — this value is the join key into `paragraphs.ref_code`. */
const refCodeOf = (paragraph: Paragraph, bookId: number): string =>
  Option.getOrElse(
    paragraph.refcode_short,
    () =>
      paragraph.refcode_long ??
      paragraph.para_id ??
      `book-${String(bookId)}-para-${String(paragraph.puborder)}`,
  );

const walkScriptureRefs = (nodes: readonly Node[], out: { readonly title: string }[]): void => {
  for (const node of nodes) {
    if (node._tag === 'ScriptureRef') {
      out.push({ title: node.title });
      // ScriptureRefs in this corpus don't nest other ScriptureRefs, but the
      // recursion below covers it defensively without measurable cost.
    }
    if (
      node._tag === 'Emphasis' ||
      node._tag === 'Comment' ||
      node._tag === 'ScriptureRef' ||
      node._tag === 'BookRef' ||
      node._tag === 'Unknown'
    ) {
      walkScriptureRefs(node.children, out);
    }
  }
};

/**
 * Walk all ScriptureRef nodes in `paragraphs`, parse each `title` via
 * `parseBibleQuery`, and yield the rows expected by
 * `EGWParagraphDatabase.storeBibleRefsBatch`.
 *
 * Behavior:
 * - `single` / `verseRange` → emits one row per concrete verse (rangeStart..rangeEnd)
 *   so a query like "Genesis 3:1-5" hydrates all five verse-anchored lookups.
 * - `chapter` → one row with `bibleVerse: null` (commentary on the whole chapter).
 * - `fullBook`, `chapterRange`, `search` → skipped (too coarse to anchor to a verse
 *   row meaningfully; the chapter renderer wouldn't surface those either way).
 * - Parse failures → silently skipped. The catalog of EGW titles is large and
 *   imperfect; per-ref failures shouldn't abort a chapter index pass.
 *
 * Duplicates are removed (a paragraph that mentions "Genesis 3:1" twice should
 * still produce a single (book,chapter,verse) row — the PK on the destination
 * table would dedupe anyway, but skipping here saves transaction work).
 */
export const extractScriptureRefs = (
  paragraphs: readonly Paragraph[],
  bookId: number,
): readonly ExtractedBibleRef[] => {
  const seen = new Set<string>();
  const out: ExtractedBibleRef[] = [];

  for (const paragraph of paragraphs) {
    const refCode = refCodeOf(paragraph, bookId);
    const titles: { readonly title: string }[] = [];
    walkScriptureRefs(paragraph.nodes, titles);

    for (const { title } of titles) {
      const parsed = parseBibleQuery(title);
      const rows = expandParsed(parsed);
      for (const row of rows) {
        const key = `${refCode}|${String(row.bibleBook)}|${String(row.bibleChapter)}|${String(row.bibleVerse ?? -1)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ bookId, refCode, ...row });
      }
    }
  }
  return out;
};

const expandParsed = (
  parsed: ReturnType<typeof parseBibleQuery>,
): readonly { bibleBook: number; bibleChapter: number; bibleVerse: number | null }[] => {
  switch (parsed._tag) {
    case 'single': {
      // parseBibleQuery always sets `verse` for the 'single' tag (whole-chapter
      // titles fall through to the 'chapter' tag), but the BibleReference
      // schema marks verse as optional. Treat a missing verse as chapter-wide.
      const verse = parsed.ref.verse ?? null;
      return [
        {
          bibleBook: parsed.ref.book,
          bibleChapter: parsed.ref.chapter,
          bibleVerse: verse,
        },
      ];
    }
    case 'chapter':
      return [{ bibleBook: parsed.book, bibleChapter: parsed.chapter, bibleVerse: null }];
    case 'verseRange': {
      const rows: { bibleBook: number; bibleChapter: number; bibleVerse: number | null }[] = [];
      for (let v = parsed.startVerse; v <= parsed.endVerse; v++) {
        rows.push({ bibleBook: parsed.book, bibleChapter: parsed.chapter, bibleVerse: v });
      }
      return rows;
    }
    case 'chapterRange':
    case 'fullBook':
    case 'search':
      return [];
  }
};
