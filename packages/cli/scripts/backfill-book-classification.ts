/**
 * Backfill the library's own classification onto `books`.
 *
 * The corpus was synced before `book_type`, `book_subtype`, `folder_id` and
 * `section` existed on the `books` table, so 1,486 rows carry no
 * classification at all and every filter built on one is inert. This walks the
 * content API's folder tree once, reads the book records under each folder,
 * and writes the four columns.
 *
 * **Read-only against the 3M-row `paragraphs` table.** It touches `books`
 * alone, which is 1,486 rows, so it is safe to re-run and takes seconds rather
 * than the hours a re-sync would.
 *
 * `section` is the one field no book record carries: it is the name of the
 * top-level folder a book sits under, which only the tree knows. So the walk
 * carries each folder's root down to its books rather than deriving it
 * afterwards from `folder_id`.
 *
 *   bun packages/cli/scripts/backfill-book-classification.ts [--dry-run]
 */

import { Database } from 'bun:sqlite';

import { SECTION_BY_ROOT_FOLDER, type CorpusSection } from '@bible/core/writings';

interface FolderNode {
  readonly folder_id: number;
  readonly name: string;
  readonly nbooks: number;
  readonly children?: readonly FolderNode[];
}

interface BookRecord {
  readonly code: string;
  readonly type: string;
  readonly subtype?: string | null;
  readonly folder_id: number;
}

const CORPUS = `${process.env['HOME']}/.bible/egw-paragraphs.db`;
const API = 'https://a.egwwritings.org';
const TOKEN_URL = 'https://cpanel.egwwritings.org/connect/token';
const SCOPE = 'writings search studycenter subscriptions user_info';

const dryRun = process.argv.includes('--dry-run');

const readEnv = async (file: string): Promise<Record<string, string>> => {
  const text = await Bun.file(file).text();
  const pairs = text
    .split('\n')
    .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
    .map((line): readonly [string, string] => {
      const cut = line.indexOf('=');
      return [
        line.slice(0, cut).trim(),
        line
          .slice(cut + 1)
          .trim()
          .replace(/^["']|["']$/gu, ''),
      ];
    });
  return Object.fromEntries(pairs);
};

const token = async (): Promise<string> => {
  const vars = await readEnv(`${import.meta.dir}/../.env`);
  const id = vars['EGW_CLIENT_ID'];
  const secret = vars['EGW_CLIENT_SECRET'];
  if (id === undefined || secret === undefined) {
    throw new Error('EGW_CLIENT_ID / EGW_CLIENT_SECRET missing from packages/cli/.env');
  }
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(SCOPE)}`,
  });
  if (!response.ok) throw new Error(`token request failed: HTTP ${response.status}`);
  const body: { readonly access_token?: string } = await response.json();
  const value = body.access_token;
  if (value === undefined) throw new Error('token response carried no access_token');
  return value;
};

const get = async <A>(path: string, bearer: string): Promise<A> => {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  if (!response.ok) throw new Error(`GET ${path} failed: HTTP ${response.status}`);
  return response.json() as Promise<A>;
};

/** Every folder that holds books, tagged with the top-level section it sits
 *  under. The root's own name is the section, so it is captured on the way
 *  down rather than looked up on the way back. */
const leaves = (
  nodes: readonly FolderNode[],
  root?: string,
): readonly { readonly id: number; readonly section: CorpusSection | undefined }[] =>
  nodes.flatMap((node) => {
    const name = root ?? node.name;
    const section = SECTION_BY_ROOT_FOLDER[name];
    const here = node.nbooks > 0 ? [{ id: node.folder_id, section }] : [];
    return [...here, ...leaves(node.children ?? [], name)];
  });

const main = async (): Promise<void> => {
  const bearer = await token();

  const tree = await get<readonly FolderNode[] | { readonly results: readonly FolderNode[] }>(
    '/content/languages/en/folders',
    bearer,
  );
  const roots = Array.isArray(tree) ? tree : tree.results;
  const folders = leaves(roots);
  console.log(`folders holding books: ${String(folders.length)}`);

  const records: { readonly book: BookRecord; readonly section: CorpusSection | undefined }[] = [];
  for (const folder of folders) {
    const page = await get<readonly BookRecord[] | { readonly results: readonly BookRecord[] }>(
      `/content/books/by_folder/${String(folder.id)}`,
      bearer,
    );
    const books = Array.isArray(page) ? page : page.results;
    for (const book of books) records.push({ book, section: folder.section });
  }
  console.log(`book records fetched: ${String(records.length)}`);

  // `{ readonly: false }` is not the same as omitting it: bun:sqlite requires
  // one of the two open flags, and `readonly: false` sets neither.
  const db = dryRun ? new Database(CORPUS, { readonly: true }) : new Database(CORPUS);

  // The columns are created by `EGWParagraphDatabase.layerCore`'s ALTER block,
  // which only runs when something opens the corpus through Effect. This script
  // opens it directly, so it adds them itself if the layer has not yet — the
  // same idempotent `PRAGMA table_info` check, so running either first is fine.
  if (!dryRun) {
    const existing = new Set(
      db
        .query<{ readonly name: string }, []>('pragma table_info(books)')
        .all()
        .map((row) => row.name),
    );
    for (const [name, type] of [
      ['book_type', 'TEXT'],
      ['book_subtype', 'TEXT'],
      ['folder_id', 'INTEGER'],
      ['section', 'TEXT'],
    ] as const) {
      if (!existing.has(name)) db.run(`ALTER TABLE books ADD COLUMN ${name} ${type}`);
    }
  }
  const local = new Set(
    db
      .query<{ readonly book_code: string }, []>('select book_code from books')
      .all()
      .map((row) => row.book_code),
  );

  const applicable = records.filter((record) => local.has(record.book.code));
  const unmatchedLocal = [...local].filter(
    (code) => !records.some((record) => record.book.code === code),
  );
  console.log(
    `local books: ${String(local.size)} | classifiable: ${String(applicable.length)} | no API record: ${String(unmatchedLocal.length)}`,
  );
  if (unmatchedLocal.length > 0) console.log(`  unclassified: ${unmatchedLocal.join(', ')}`);

  if (dryRun) {
    const bySection: Record<string, number> = {};
    for (const record of applicable) {
      const key = record.section ?? '(none)';
      bySection[key] = (bySection[key] ?? 0) + 1;
    }
    console.log('dry run — would write:', bySection);
    db.close();
    return;
  }

  const update = db.prepare(
    `update books set book_type = ?, book_subtype = ?, folder_id = ?, section = ?
     where book_code = ?`,
  );
  const writeAll = db.transaction(
    (rows: readonly { readonly book: BookRecord; readonly section?: string }[]) => {
      for (const row of rows) {
        const subtype = row.book.subtype?.trim();
        update.run(
          row.book.type,
          subtype === undefined || subtype === '' ? null : subtype,
          row.book.folder_id,
          row.section ?? null,
          row.book.code,
        );
      }
    },
  );
  writeAll(applicable);

  const check = db
    .query<{ readonly section: string | null; readonly n: number; readonly p: number }, []>(
      `select section, count(*) n, sum(paragraph_count) p from books group by section order by p desc`,
    )
    .all();
  console.log('=== after backfill ===');
  for (const row of check) {
    console.log(
      `${String(row.p).padStart(9)}  ${String(row.n).padStart(5)} books  ${row.section ?? '(unclassified)'}`,
    );
  }
  db.close();
};

await main();
