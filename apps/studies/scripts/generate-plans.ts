#!/usr/bin/env bun
// Generate PLAN.md (index) + plans/<slug>.md (per-chapter curation checklists)
// for the bohr-vs-millers-rules series. Each per-chapter plan lists every
// verse with a per-pioneer checkbox; ticking maps 1:1 to a JSON entry under
// verse.pioneerReadings.
//
// Pioneer source set tracks PioneerSource enum in scripts/schema.ts. Every
// listed pioneer is in the local EGW Writings DB (run `bible egw books` to
// audit), so a `bible egw search --book <code>` query is always meaningful.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PIONEER_SOURCE_NAMES, type Chapter, type PioneerSource } from './schema.ts';

const __filename = fileURLToPath(import.meta.url);
const HERE = resolve(__filename, '..', '..');
const SERIES_ROOT = resolve(HERE, 'content', 'series', 'bohr-vs-millers-rules');
const CHAPTERS_DIR = join(SERIES_ROOT, 'chapters');
const PLANS_DIR = join(SERIES_ROOT, 'plans');

if (!existsSync(PLANS_DIR)) {
  mkdirSync(PLANS_DIR, { recursive: true });
}

// Canonical order: Dan 11 first, then Rev 1-22.
const ORDER: string[] = ['dan-11', ...Array.from({ length: 22 }, (_, i) => `rev-${i + 1}`)];

type PioneerEntry = {
  source: PioneerSource;
  preferredBooks: string[]; // local EGW Writings codes
  primaryCommand: string; // exact CLI invocation template for the curator
  note?: string;
};

const PIONEERS: PioneerEntry[] = [
  {
    source: 'smith',
    preferredBooks: ['DAR', 'STTHD', 'TTHDS', 'KPC'],
    primaryCommand: 'bible egw search "<term>" --book DAR --json',
  },
  {
    source: 'egw',
    preferredBooks: ['GC', 'EW', 'PK', 'PP', 'AA', 'DA', '1T-9T', 'Ev', 'SR'],
    primaryCommand: 'bible egw commentary "<book> <chapter>:<verse>" --json',
    note: 'EGW Commentary index (`commentary`) is the fastest entry point; widen with `search --book GC` for thematic hits.',
  },
  {
    source: 'miller',
    preferredBooks: ['MWV1', 'MWV2', 'MWV3', 'WMAD', 'MRSH', 'LJHCS'],
    primaryCommand: 'bible egw search "<term>" --book MWV2 --json',
  },
  {
    source: 'litch',
    preferredBooks: ['PREX1', 'PREX2', 'PSC'],
    primaryCommand: 'bible egw search "<term>" --book PREX1 --json',
    note: 'PREX1+PREX2 = Prophetic Expositions; PSC = the 1838 paper that predicted Aug 11 1840.',
  },
  {
    source: 'j-white',
    preferredBooks: ['SLWM', 'LELJB', 'FUMP', 'SATDSD', 'TTAM'],
    primaryCommand: 'bible egw search "<term>" --book SATDSD --json',
  },
  {
    source: 'andrews',
    preferredBooks: ['TMR', 'S23D', 'SOTB', 'HSFD', 'TWL', 'SITL'],
    primaryCommand: 'bible egw search "<term>" --book TMR --json',
    note: 'TMR = Three Messages of Rev 14:6-12 (canonical Rev 13-14 source).',
  },
  {
    source: 'crosier',
    preferredBooks: ['SANC'],
    primaryCommand: 'bible egw search "<term>" --book SANC --json',
    note: 'Crosier — the 1846 sanctuary article. Single book, 97 paragraphs; usually quoted whole-cloth.',
  },
  {
    source: 'haskell',
    preferredBooks: ['SDP', 'SSP'],
    primaryCommand: 'bible egw search "<term>" --book SSP --json',
    note: 'SDP = Story of Daniel the Prophet; SSP = Story of the Seer of Patmos. Use SDP for Daniel chapters, SSP for Revelation.',
  },
  {
    source: 'jones',
    preferredBooks: ['GEP', 'ECE', 'TTR', 'CWCP', 'LOF_ATJ'],
    primaryCommand: 'bible egw search "<term>" --book GEP --json',
    note: 'GEP = Great Empires of Prophecy (best for Dan 11 + Rev historical backbone); ECE = Ecclesiastical Empire (papal apostasy); TTR = Two Republics (USA = Rev 13 second beast).',
  },
  {
    source: 'waggoner',
    preferredBooks: ['CHR', 'EVCO', 'GTI', 'FACC', 'WOR', 'LOF_EJW'],
    primaryCommand: 'bible egw search "<term>" --book EVCO --json',
    note: 'EVCO = Everlasting Covenant (covenant + sanctuary themes); FACC = Fathers of the Catholic Church (apostasy / Babylon framing).',
  },
  {
    source: 'bates',
    preferredBooks: ['BP1', 'BP2', 'BP3', 'AJB'],
    primaryCommand: 'bible egw search "<term>" --book BP2 --json',
    note: 'BP2 = Second Advent Way Marks (1840s chart material); BP3 = sanctuary typology.',
  },
  {
    source: 'loughborough',
    preferredBooks: ['GSAM', 'PGGC', 'THB', 'TBUS'],
    primaryCommand: 'bible egw search "<term>" --book GSAM --json',
    note: 'GSAM = Great Second Advent Movement (movement history & verse application); THB / TBUS = Two-Horned Beast = USA in Rev 13.',
  },
  {
    source: 'fitch',
    preferredBooks: ['LJL', 'LCFMC'],
    primaryCommand: 'bible egw search "<term>" --book LJL --json',
    note: 'Charles Fitch — Millerite leader, designed the 1843 chart. LJL = his open letter on the Second Coming.',
  },
];

function loadChapter(slug: string): Chapter {
  const text = readFileSync(join(CHAPTERS_DIR, `${slug}.json`), 'utf8');
  return JSON.parse(text) as Chapter;
}

function curatedSourcesForVerse(verse: Chapter['verses'][number]): Set<PioneerSource> {
  return new Set(verse.pioneerReadings.map((r) => r.source));
}

function checkbox(checked: boolean): string {
  return checked ? '[x]' : '[ ]';
}

function chapterPlanBody(chapter: Chapter): string {
  const lines: string[] = [];
  lines.push(`# Plan — ${chapter.title}`);
  lines.push('');
  lines.push(
    `Verses: ${chapter.verses.length}. Source = \`content/series/bohr-vs-millers-rules/chapters/${chapter.slug}.json\`.`,
  );
  lines.push('');
  lines.push(
    'Tick a box once the corresponding `pioneerReadings` entry is committed in the JSON. Pioneers without commentary on a given verse are expected — only tick what actually exists in the corpus. The count next to each verse heading shows how many pioneers have been curated so far.',
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const verse of chapter.verses) {
    const curated = curatedSourcesForVerse(verse);
    lines.push(`### ${verse.ref} — ${curated.size} curated`);
    lines.push('');
    lines.push(`> ${verse.text.replace(/\s+/g, ' ').trim()}`);
    lines.push('');
    for (const pioneer of PIONEERS) {
      const ticked = curated.has(pioneer.source);
      const name = PIONEER_SOURCE_NAMES[pioneer.source];
      lines.push(`- ${checkbox(ticked)} **${name}**`);
    }
    lines.push('');
  }

  return lines.join('\n') + '\n';
}

function indexBody(chapters: Chapter[]): string {
  const lines: string[] = [];
  lines.push('# Pioneer Curation Plan');
  lines.push('');
  lines.push(
    'Per-chapter coverage checklists for populating `Verse.pioneerReadings` across all 23 chapters of `bohr-vs-millers-rules`. Each chapter has its own plan under `plans/<slug>.md` — open a plan, pick a verse, run the suggested CLI lookup, paste the resulting reading into the chapter JSON, and tick the box.',
  );
  lines.push('');
  lines.push('## Pioneer source set');
  lines.push('');
  lines.push(
    'All 13 pioneers below have their preferred books available in the local EGW Writings DB. Run `bible egw books` to audit; run `bible egw download <code>` (or `--id <id>`) to refresh a specific volume.',
  );
  lines.push('');
  lines.push('| Source | Preferred books (EGW Writings codes) | Primary lookup |');
  lines.push('| --- | --- | --- |');
  for (const p of PIONEERS) {
    const name = PIONEER_SOURCE_NAMES[p.source];
    const books = p.preferredBooks.length > 0 ? p.preferredBooks.join(', ') : '—';
    lines.push(`| ${name} | ${books} | \`${p.primaryCommand}\` |`);
  }
  lines.push('');
  for (const p of PIONEERS) {
    if (p.note) {
      lines.push(`- **${PIONEER_SOURCE_NAMES[p.source]}** — ${p.note}`);
    }
  }
  lines.push('');
  lines.push('## CLI workflow');
  lines.push('');
  lines.push('```sh');
  lines.push('# 1. EGW commentary for a specific verse (fastest path for EGW)');
  lines.push('bible egw commentary "rev 9:13" --json');
  lines.push('');
  lines.push('# 2. Scoped FTS inside a pioneer book');
  lines.push('bible egw search "Ottoman" --book PREX1 --json');
  lines.push('bible egw search "image of the beast" --book TMR --json');
  lines.push('');
  lines.push('# 3. Exact refcode lookup (after finding a hit)');
  lines.push('bible egw lookup "GC 334.2" --json');
  lines.push('bible egw lookup "DAR 478.3-479.5" --json');
  lines.push('');
  lines.push('# 4. Fallback: full corpus FTS (no --book scope)');
  lines.push('bible egw search "midnight cry" --json');
  lines.push('```');
  lines.push('');
  lines.push('## Per-chapter coverage');
  lines.push('');

  lines.push(
    'Each verse can attract 0–13 pioneer readings (some pioneers wrote nothing on a given verse — that\'s fine). The "Pioneer entries" column counts all `pioneerReadings` rows currently in the chapter JSON.',
  );
  lines.push('');
  lines.push('| Chapter | Verses | Pioneer entries | Plan |');
  lines.push('| --- | ---: | ---: | --- |');
  for (const chapter of chapters) {
    let entryCount = 0;
    for (const verse of chapter.verses) {
      entryCount += verse.pioneerReadings.length;
    }
    lines.push(
      `| ${chapter.title} | ${chapter.verses.length} | ${entryCount} | [plan](plans/${chapter.slug}.md) |`,
    );
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(
    '_Generated by `apps/studies/scripts/generate-plans.ts`. Re-run after curating to refresh coverage counts._',
  );
  lines.push('');

  return lines.join('\n');
}

// ---- main ----

const seenSlugs = new Set(
  readdirSync(CHAPTERS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, '')),
);
const orderedChapters = ORDER.filter((s) => seenSlugs.has(s)).map(loadChapter);

for (const chapter of orderedChapters) {
  const path = join(PLANS_DIR, `${chapter.slug}.md`);
  writeFileSync(path, chapterPlanBody(chapter));
  console.log(`wrote ${path}`);
}

const indexPath = join(SERIES_ROOT, 'PLAN.md');
writeFileSync(indexPath, indexBody(orderedChapters));
console.log(`wrote ${indexPath}`);
