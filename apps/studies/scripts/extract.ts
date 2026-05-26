#!/usr/bin/env bun
/**
 * Mechanical markdown -> JSON splitter for the bohr-vs-millers-rules audit.
 *
 * Verbatim extraction only. Failed classification raises; never paraphrases.
 *
 * Source : packages/cli/outputs/studies/.../bohr-vs-millers-rules.md
 * Output : apps/studies/content/series/bohr-vs-millers-rules/...
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  type Chapter,
  type ChapterIndexEntry,
  RULE_NAMES,
  RULE_ORDER,
  type RuleNumber,
  type SeriesMeta,
  type Verse,
  type Violation,
} from './schema.ts';

// ---------- paths ----------

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(APP_ROOT, '..', '..');
const SOURCE_PATH = resolve(
  REPO_ROOT,
  'packages/cli/outputs/studies/daniel-revelation/v3-the-sure-word/reference/bohr-vs-millers-rules.md',
);
const SUMMARY_SOURCE_PATH = resolve(
  REPO_ROOT,
  'packages/cli/outputs/studies/daniel-revelation/v3-the-sure-word/reference/bohr-vs-millers-rules-summary.md',
);
const OUT_ROOT = resolve(APP_ROOT, 'content/series/bohr-vs-millers-rules');

// ---------- helpers ----------

const CHAPTER_HEADING_RE = /^##\s+(Daniel\s+11|Revelation\s+\d+)\s+—\s+verse-by-verse audit\s*$/i;
const VERSE_HEADING_RE = /^###\s+(Dan|Rev)\s+(\d+):(\d+(?:-\d+)?)\s+—\s+["“](.+)["”]\s*$/;

const VALID_RULE_NUMBERS = new Set<string>(Object.keys(RULE_NAMES));

function chapterSlug(refHeading: string): string {
  const m = refHeading.match(/^(Daniel|Revelation)\s+(\d+)/i);
  if (!m) throw new Error(`Cannot derive slug from heading: ${refHeading}`);
  const [, book, num] = m;
  return `${book!.toLowerCase().startsWith('d') ? 'dan' : 'rev'}-${num}`;
}

function chapterRef(refHeading: string): string {
  const m = refHeading.match(/^(Daniel|Revelation)\s+(\d+)/i);
  if (!m) throw new Error(`Cannot derive ref from heading: ${refHeading}`);
  const [, book, num] = m;
  return `${book!.toLowerCase().startsWith('d') ? 'Dan' : 'Rev'} ${num}`;
}

function verseSlugFromNum(num: string): string {
  return `v-${num}`;
}

// ---------- label detection ----------

/**
 * Each verse row is a flat sequence of paragraphs separated by blank lines.
 * Every classifiable block begins with a bold label `**...**`. The recognizer
 * matches the label, strips the marker, and returns the remaining markdown
 * inline content verbatim.
 */
type Block = {
  raw: string; // full original markdown block, no trailing newline
  label: string | null; // text inside **...** at start of block (no colon)
  body: string; // content after the leading "**Label:**" marker
};

const LABEL_PREFIX_RE = /^\*\*([^*][^*]*?)\*\*\s*:?\s*/;

function blockify(section: string): Block[] {
  // First split on blank lines into raw chunks (paragraphs + list groups +
  // standalone label lines). Then merge: a chunk that starts with **Label:**
  // and has empty body absorbs subsequent unlabeled chunks until the next
  // label-led chunk.
  const raw = section
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const blocks: Block[] = [];
  for (const chunk of raw) {
    const m = chunk.match(LABEL_PREFIX_RE);
    if (m) {
      const label = m[1]!.trim().replace(/:$/, '');
      const body = chunk.slice(m[0].length);
      blocks.push({ raw: chunk, label, body });
      continue;
    }
    // Unlabeled chunk: attach to the previous labeled block as continuation
    // body. If there is no previous block, push as label-less standalone.
    const prev = blocks[blocks.length - 1];
    if (prev && prev.label !== null) {
      prev.body = prev.body ? `${prev.body}\n\n${chunk}` : chunk;
      prev.raw = `${prev.raw}\n\n${chunk}`;
      continue;
    }
    blocks.push({ raw: chunk, label: null, body: chunk });
  }
  return blocks;
}

// ---------- verse parsing ----------

type ParsedVerseInput = {
  chapterSlug: string;
  chapterRef: string;
  num: string; // "2" or "9-11"
  text: string; // KJV verse text from heading
  bodySection: string; // everything between this heading and the next `---`
};

function parseVerse(input: ParsedVerseInput): Verse {
  const slug = verseSlugFromNum(input.num);
  const ref = `${input.chapterRef}:${input.num}`;

  const blocks = blockify(input.bodySection);

  const verse: Verse = {
    ref,
    num: /^\d+$/.test(input.num) ? Number(input.num) : input.num,
    slug,
    text: input.text,
    pioneerReading: null,
    bohrReading: null,
    warrant: null,
    violations: null,
    status: null,
    symbols: null,
    notes: [],
    extensions: [],
    unclassified: [],
  };

  for (const b of blocks) {
    classify(b, verse, ref);
  }

  return verse;
}

function classify(b: Block, verse: Verse, verseRef: string): void {
  if (b.label === null) {
    // Continuation paragraph after some prior labeled block; attach to it.
    if (verse.notes.length > 0) {
      // Most recent note absorbs the continuation.
      const last = verse.notes[verse.notes.length - 1]!;
      last.html = `${last.html}\n\n${b.raw}`;
      return;
    }
    if (verse.bohrReading) {
      verse.bohrReading.html = `${verse.bohrReading.html}\n\n${b.raw}`;
      return;
    }
    if (verse.pioneerReading) {
      verse.pioneerReading.html = `${verse.pioneerReading.html}\n\n${b.raw}`;
      return;
    }
    verse.unclassified.push(b.raw);
    return;
  }

  const label = b.label;

  // Pioneer reading — possibly with citation in parens
  if (/^Pioneer reading(\s*\([^)]*\))?$/i.test(label)) {
    verse.pioneerReading = { citation: extractCitation(label), html: b.body };
    return;
  }

  // Extension beyond Smith — labeled extension block
  if (/^Extension beyond Smith(\s*\([^)]*\))?$/i.test(label)) {
    verse.extensions.push({ label, html: b.body });
    return;
  }

  // Bohr's reading — possibly with citation
  if (/^Bohr['’]s reading(\s*\([^)]*\))?$/i.test(label)) {
    verse.bohrReading = { citation: extractCitation(label), html: b.body };
    return;
  }

  // Bohr's methodological warrant
  if (/^Bohr['’]s methodological warrant/i.test(label)) {
    verse.warrant = { label, html: b.body };
    return;
  }

  // Violations — broader-use scoped
  if (/^Miller rules broken by the broader use Bohr makes of this verse$/i.test(label)) {
    verse.violations = {
      scope: 'broader-use',
      label,
      items: parseViolations(b.body, verseRef),
    };
    return;
  }

  // Violations — verse-scoped
  if (/^Miller rules broken$/i.test(label)) {
    verse.violations = {
      scope: 'verse',
      label,
      items: parseViolations(b.body, verseRef),
    };
    return;
  }

  // Status
  if (/^Miller-rule status(\s*\([^)]*\))?$/i.test(label)) {
    verse.status = { label, html: b.body };
    return;
  }

  // Symbols redefined
  if (/^Symbols redefined$/i.test(label)) {
    verse.symbols = { label, html: b.body };
    return;
  }

  // Notes / editorial framework labels / "Why X is the natural reading" etc.
  if (
    /^Note(\s*\([^)]*\))?$/i.test(label) ||
    /^Editorial framework label/i.test(label) ||
    /^Why\s.+is the natural reading\.?$/i.test(label) ||
    /^Whom the king of the north destroys\.?$/i.test(label)
  ) {
    verse.notes.push({ label, html: b.body });
    return;
  }

  // Catch-all: keep as note with the original label preserved.
  verse.notes.push({ label, html: b.body });
}

function extractCitation(label: string): string | null {
  const m = label.match(/\(([^)]+)\)\s*$/);
  return m ? m[1]!.trim() : null;
}

// ---------- violation parsing ----------

function parseViolations(body: string, verseRef: string): Violation[] {
  // The body is a markdown list. Each top-level `- ` introduces a violation
  // whose first inline content is `**Rule XYZ**` (optionally followed by `,`,
  // `(name)`, or `**`-decorated paren content). Subsequent list items at
  // higher indent are continuation prose for that violation.
  const lines = body.split('\n');

  type Item = { lead: string; cont: string[] };
  const items: Item[] = [];
  let current: Item | null = null;

  for (const line of lines) {
    const m = line.match(/^(\s*)-\s+(.*)$/);
    if (m) {
      const indent = m[1]!.length;
      const content = m[2]!;
      if (indent === 0) {
        if (current) items.push(current);
        current = { lead: content, cont: [] };
        continue;
      }
      // Indented list item — attach as continuation.
      if (!current) {
        current = { lead: content, cont: [] };
        continue;
      }
      current.cont.push(line);
      continue;
    }
    // Non-list line — continuation of current item if any.
    if (current) current.cont.push(line);
  }
  if (current) items.push(current);

  return items.map((it) => itemToViolation(it, verseRef));
}

function itemToViolation(it: { lead: string; cont: string[] }, verseRef: string): Violation {
  const ruleMatch = it.lead.match(/^\*\*Rule\s+([IVX/]+)\*\*/);
  if (!ruleMatch) {
    throw new Error(
      `Violation parse failure at ${verseRef}: lead line does not start with "**Rule XXX**":\n${it.lead}`,
    );
  }
  const ruleStr = ruleMatch[1]!;
  if (!VALID_RULE_NUMBERS.has(ruleStr)) {
    throw new Error(`Unknown rule "${ruleStr}" at ${verseRef}`);
  }
  const ruleNumber = ruleStr as RuleNumber;
  const ruleName = RULE_NAMES[ruleNumber];
  const ruleOrder = RULE_ORDER[ruleNumber];

  // Strip "**Rule XYZ**" + optional " (...)" + ". " / ", " from lead.
  let body = it.lead.slice(ruleMatch[0].length);
  // Drop a leading bold parenthetical "(every word fulfilled)" or unbolded "(every word fulfilled)"
  body = body.replace(/^\s*(\*\*\s*\([^)]*\)\s*\*\*|\([^)]*\))\s*/, '');
  // Strip a leading ". " or ", " or " - "
  body = body.replace(/^\s*[.,–-]\s*/, '').trim();

  if (it.cont.length > 0) {
    body = [body, ...it.cont].join('\n').trim();
  }

  return { ruleNumber, ruleName, ruleOrder, body };
}

// ---------- chapter split ----------

function splitIntoChapters(md: string): Array<{ heading: string; body: string }> {
  const lines = md.split('\n');
  type Acc = { heading: string | null; lines: string[] };
  const chapters: Array<{ heading: string; body: string }> = [];
  let current: Acc | null = null;

  for (const line of lines) {
    const cm = line.match(CHAPTER_HEADING_RE);
    if (cm) {
      if (current && current.heading) {
        chapters.push({ heading: current.heading, body: current.lines.join('\n') });
      }
      current = { heading: cm[1]!, lines: [] };
      continue;
    }
    // Stop at the post-audit "## Rule-violation frequency table" section header.
    const otherSection = /^##\s+(Rule-violation frequency table|Observations|Source references)\b/i;
    if (otherSection.test(line)) {
      if (current && current.heading) {
        chapters.push({ heading: current.heading, body: current.lines.join('\n') });
        current = null;
      }
    }
    if (current) current.lines.push(line);
  }
  if (current && current.heading) {
    chapters.push({ heading: current.heading, body: current.lines.join('\n') });
  }
  return chapters;
}

// ---------- verse split within a chapter ----------

type RawVerseRow = {
  num: string;
  text: string;
  body: string;
};

function splitChapterIntoVerseRows(chapterBody: string): {
  intro: string | null;
  rows: RawVerseRow[];
} {
  const lines = chapterBody.split('\n');

  let i = 0;
  const introLines: string[] = [];
  // Pull pre-verse intro until first `### Dan X:Y` or `### Rev X:Y` heading.
  while (i < lines.length) {
    if (VERSE_HEADING_RE.test(lines[i]!)) break;
    introLines.push(lines[i]!);
    i++;
  }

  const rows: RawVerseRow[] = [];
  let cur: { num: string; text: string; body: string[] } | null = null;

  while (i < lines.length) {
    const line = lines[i]!;
    const vm = line.match(VERSE_HEADING_RE);
    if (vm) {
      if (cur) {
        rows.push({ num: cur.num, text: cur.text, body: trimVerseBody(cur.body) });
      }
      cur = { num: vm[3]!, text: vm[4]!, body: [] };
      i++;
      continue;
    }
    if (/^---\s*$/.test(line) && cur) {
      rows.push({ num: cur.num, text: cur.text, body: trimVerseBody(cur.body) });
      cur = null;
      i++;
      continue;
    }
    if (cur) cur.body.push(line);
    i++;
  }
  if (cur) rows.push({ num: cur.num, text: cur.text, body: trimVerseBody(cur.body) });

  const intro = introLines
    .map((l) => l)
    .join('\n')
    .trim();
  return { intro: intro ? intro : null, rows };
}

function trimVerseBody(lines: string[]): string {
  return lines.join('\n').trim();
}

// ---------- chapter title ----------

function chapterTitle(heading: string): string {
  // "Daniel 11" -> "Daniel 11"
  // "Revelation 9" -> "Revelation 9"
  return heading.trim();
}

// ---------- summary block ----------

function findChapterSummary(body: string): string | null {
  // Each chapter ends with an emphasized paragraph like
  //   **Rev 22 violation summary (...):** ...
  // Capture it.
  const m = body.match(/\n\n\*\*([^*]+violation summary[^*]*)\*\*[^\n]*\n?[\s\S]*$/i);
  if (!m) return null;
  return m[0].trim();
}

// ---------- main ----------

function main(): void {
  const src = readFileSync(SOURCE_PATH, 'utf8');
  const chapters = splitIntoChapters(src);
  if (chapters.length === 0) {
    throw new Error('No chapters found — recognizer is broken.');
  }

  // Clean output dir.
  rmSync(OUT_ROOT, { recursive: true, force: true });
  mkdirSync(join(OUT_ROOT, 'chapters'), { recursive: true });

  const index: ChapterIndexEntry[] = [];

  for (const ch of chapters) {
    const slug = chapterSlug(ch.heading);
    const ref = chapterRef(ch.heading);
    const title = chapterTitle(ch.heading);
    const { intro, rows } = splitChapterIntoVerseRows(ch.body);
    const summaryHtml = findChapterSummary(ch.body);

    const verses: Verse[] = rows.map((r) =>
      parseVerse({
        chapterSlug: slug,
        chapterRef: ref,
        num: r.num,
        text: r.text,
        bodySection: r.body,
      }),
    );

    const chapter: Chapter = {
      slug,
      ref,
      title,
      intro,
      verses,
      summaryHtml,
    };

    writeFileSync(join(OUT_ROOT, 'chapters', `${slug}.json`), JSON.stringify(chapter, null, 2));

    const addressed = verses.filter((v) => v.bohrReading || v.violations || v.status).length;
    const violations = verses.filter((v) => v.violations && v.violations.items.length > 0).length;
    const density = verses.length > 0 ? Math.round((violations / verses.length) * 100) : 0;

    index.push({
      slug,
      ref,
      title,
      verseCount: verses.length,
      addressed,
      violations,
      density,
    });
  }

  writeFileSync(join(OUT_ROOT, 'chapters.json'), JSON.stringify(index, null, 2));

  const meta: SeriesMeta = {
    slug: 'bohr-vs-millers-rules',
    title: "Bohr vs. Miller's Rules",
    subtitle: 'a verse-by-verse audit',
    eyebrow: 'Reference · v3 The Sure Word',
    lede: "A 280-verse audit of Stephen Bohr's published readings of Daniel 11 and Revelation 1-22, scored against William Miller's 14 Rules of Interpretation (1842) and compared against the pioneer SDA baseline in Uriah Smith's Daniel and the Revelation.",
    source: {
      path: 'packages/cli/outputs/studies/daniel-revelation/v3-the-sure-word/reference/bohr-vs-millers-rules.md',
      extractedAt: new Date().toISOString(),
    },
  };
  writeFileSync(join(OUT_ROOT, 'meta.json'), JSON.stringify(meta, null, 2));

  const summaryMd = readFileSync(SUMMARY_SOURCE_PATH, 'utf8');
  writeFileSync(join(OUT_ROOT, 'summary.md'), summaryMd);

  // Validation report.
  const totalVerses = index.reduce((acc, e) => acc + e.verseCount, 0);
  const totalAddressed = index.reduce((acc, e) => acc + e.addressed, 0);
  const totalViolations = index.reduce((acc, e) => acc + e.violations, 0);

  console.log(`extract: wrote ${index.length} chapters`);
  console.log(`extract: ${totalVerses} verses total, ${totalAddressed} addressed by Bohr`);
  console.log(`extract: ${totalViolations} verses with rule violations`);
  for (const e of index) {
    console.log(
      `  ${e.slug.padEnd(8)}  ${String(e.verseCount).padStart(3)} v  ${String(e.violations).padStart(3)} viol  (${e.density}%)`,
    );
  }

  // Hard validation gates.
  if (totalVerses < 270) {
    throw new Error(
      `extract: only ${totalVerses} verses parsed; expected ~280. Recognizer is leaking verses.`,
    );
  }
  console.log('extract: OK');
}

main();
