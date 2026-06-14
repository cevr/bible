#!/usr/bin/env bun
/*
 * pioneer-topic — search the local EGW paragraph DB (~/.bible/egw-paragraphs.db)
 * for what the SDA pioneers (or, with --egw, Ellen White) wrote on a topic, and
 * emit clean refcode-tagged markdown.
 *
 * The DB hosts pioneer authors alongside Ellen White. Research on "what did the
 * pioneers hold on X" must scope by book_author, which is fiddly to hand-write as
 * SQL every time. This helper does the author-scoped LIKE search, dedupes, and
 * prints `**REFCODE** (Author) — text` blocks ready to paste into a corpus file.
 *
 * Usage:
 *   bun run scripts/pioneer-topic.ts "Armageddon" "battle of that great day" "kings of the east"
 *   bun run scripts/pioneer-topic.ts --egw "seven trumpets"        # Ellen White instead of pioneers
 *   bun run scripts/pioneer-topic.ts --authors "Uriah Smith" -- "seven last plagues"
 *   bun run scripts/pioneer-topic.ts --full "day of the Lord''s vengeance"   # untruncated paragraphs
 *   bun run scripts/pioneer-topic.ts --limit 60 --chars 700 "without mixture"
 *
 * Flags:
 *   --egw                 Search Ellen Gould White only (default: the nine pioneers).
 *   --authors "A" "B"     Restrict to specific book_author values (repeatable; ends at `--`).
 *   --full                Print full paragraph text (no truncation).
 *   --chars N             Truncate each paragraph to N chars (default 600; ignored with --full).
 *   --limit N             Max paragraphs to print (default 40).
 *   --db <path>           Override DB path (default ~/.bible/egw-paragraphs.db).
 *
 * Every term is matched case-insensitively (LIKE) and ORed together; a paragraph
 * matching ANY term is returned. Results are ordered by author then puborder so an
 * author's statements read in book order.
 */

import { Database } from 'bun:sqlite';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PIONEERS = [
  'James Springer White',
  'Uriah Smith',
  'Josiah Litch',
  'John Nevins Andrews',
  'Stephen Nelson Haskell',
  'William Miller',
  'Sylvester Bliss',
  'Apollos Hale',
  'Charles Fitch',
];
const EGW = ['Ellen Gould White'];

interface Options {
  terms: string[];
  authors: string[];
  full: boolean;
  chars: number;
  limit: number;
  dbPath: string;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    terms: [],
    authors: PIONEERS,
    full: false,
    chars: 600,
    limit: 40,
    dbPath: join(homedir(), '.bible', 'egw-paragraphs.db'),
  };
  let customAuthors: string[] | null = null;
  let collectingAuthors = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (collectingAuthors) {
      if (a === '--') {
        collectingAuthors = false;
      } else if (a.startsWith('--')) {
        collectingAuthors = false;
        i--; // reprocess this flag
      } else {
        (customAuthors ??= []).push(a);
      }
      continue;
    }
    switch (a) {
      case '--egw':
        opts.authors = EGW;
        break;
      case '--full':
        opts.full = true;
        break;
      case '--authors':
        customAuthors = [];
        collectingAuthors = true;
        break;
      case '--chars':
        opts.chars = Number(argv[++i]);
        break;
      case '--limit':
        opts.limit = Number(argv[++i]);
        break;
      case '--db':
        opts.dbPath = argv[++i];
        break;
      default:
        opts.terms.push(a);
    }
  }
  if (customAuthors && customAuthors.length > 0) opts.authors = customAuthors;
  return opts;
}

interface Row {
  refcode_short: string;
  book_author: string;
  book_title: string;
  content_text: string;
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.terms.length === 0) {
    console.error('Usage: bun run scripts/pioneer-topic.ts [flags] "term" ["term2" ...]');
    console.error('  --egw | --authors "A" "B" -- | --full | --chars N | --limit N | --db <path>');
    process.exit(1);
  }

  const db = new Database(opts.dbPath, { readonly: true });

  const authorPlaceholders = opts.authors.map(() => '?').join(', ');
  const termClause = opts.terms.map(() => 'p.content_text LIKE ?').join(' OR ');
  const likeParams = opts.terms.map((t) => `%${t}%`);

  const rows = db
    .query<Row, string[]>(
      `SELECT p.refcode_short, b.book_author, b.book_title, p.content_text
         FROM paragraphs p
         JOIN books b ON p.book_id = b.book_id
        WHERE b.book_author IN (${authorPlaceholders})
          AND (${termClause})
        ORDER BY b.book_author, p.puborder
        LIMIT ?`,
    )
    .all(...opts.authors, ...likeParams, String(opts.limit));

  db.close();

  const scope = opts.authors === EGW ? 'Ellen G. White' : `${opts.authors.length} author(s)`;
  console.log(`# pioneer-topic — ${opts.terms.map((t) => `"${t}"`).join(' OR ')}`);
  console.log(`_scope: ${scope}; ${rows.length} paragraph(s) (limit ${opts.limit})_\n`);

  if (rows.length === 0) {
    console.log('_No matching paragraphs._');
    return;
  }

  let lastAuthor = '';
  for (const r of rows) {
    if (r.book_author !== lastAuthor) {
      console.log(`\n## ${r.book_author}\n`);
      lastAuthor = r.book_author;
    }
    const oneLine = r.content_text.replace(/\s+/gu, ' ').trim();
    const body =
      opts.full || oneLine.length <= opts.chars ? oneLine : `${oneLine.slice(0, opts.chars)}…`;
    console.log(`> ${body}\n> — **${r.refcode_short}** (${r.book_title})\n`);
  }
}

main();
