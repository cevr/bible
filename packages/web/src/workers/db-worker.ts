/**
 * SQLite Web Worker
 *
 * Runs wa-sqlite with OPFSCoopSyncVFS for persistent local-first storage.
 * Manages three databases:
 *   - bible.db (read-only, downloaded from server on first visit)
 *   - state.db (read-write, user data — position, bookmarks, etc.)
 *   - egw-paragraphs.db (read-write, EGW commentary — incrementally synced per book)
 */
import { type Node, nodesToText } from '@bible/core/egw';
import * as SQLite from 'wa-sqlite';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import { OPFSCoopSyncVFS } from 'wa-sqlite/src/examples/OPFSCoopSyncVFS.js';

import type { WorkerRequest, WorkerResponse } from './db-protocol.js';

// Schema version. Bump this when the EGW cache shape changes — startup will
// detect the mismatch and rebuild the paragraph tables (preserving books +
// sync_status so the UI can re-trigger per-book syncs).
const EGW_SCHEMA_VERSION = 2;

const log = import.meta.env['DEV'] ? (...args: unknown[]) => console.log(...args) : () => {};

let sqlite3: SQLiteAPI;
let bibleDb: number;
let stateDb: number;
let egwDb: number;
let topicsDb: number | null = null;
let dirty = false;

function post(msg: WorkerResponse) {
  self.postMessage(msg);
}

const STATE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS position (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    book INTEGER NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY,
    book INTEGER NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER,
    note TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book INTEGER NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER,
    visited_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS preferences (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    theme TEXT NOT NULL DEFAULT 'system',
    display_mode TEXT NOT NULL DEFAULT 'verse'
  );

  INSERT OR IGNORE INTO position (id, book, chapter, verse) VALUES (1, 1, 1, 1);
  INSERT OR IGNORE INTO preferences (id, theme, display_mode) VALUES (1, 'system', 'verse');

  CREATE INDEX IF NOT EXISTS idx_history_visited_at ON history(visited_at DESC);

  CREATE TABLE IF NOT EXISTS cross_ref_classifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_book INTEGER NOT NULL,
    source_chapter INTEGER NOT NULL,
    source_verse INTEGER NOT NULL,
    ref_book INTEGER NOT NULL,
    ref_chapter INTEGER NOT NULL,
    ref_verse INTEGER NOT NULL DEFAULT 0,
    ref_verse_end INTEGER,
    type TEXT NOT NULL,
    confidence REAL,
    classified_at INTEGER NOT NULL,
    UNIQUE(source_book, source_chapter, source_verse, ref_book, ref_chapter, ref_verse)
  );

  CREATE INDEX IF NOT EXISTS idx_classifications_source
    ON cross_ref_classifications(source_book, source_chapter, source_verse);

  CREATE TABLE IF NOT EXISTS user_cross_refs (
    id TEXT PRIMARY KEY,
    source_book INTEGER NOT NULL,
    source_chapter INTEGER NOT NULL,
    source_verse INTEGER NOT NULL,
    ref_book INTEGER NOT NULL,
    ref_chapter INTEGER NOT NULL,
    ref_verse INTEGER,
    ref_verse_end INTEGER,
    type TEXT,
    note TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_user_cross_refs_source
    ON user_cross_refs(source_book, source_chapter, source_verse);

  CREATE TABLE IF NOT EXISTS sync_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    device_id TEXT NOT NULL,
    last_synced_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS verse_notes (
    id TEXT PRIMARY KEY,
    book INTEGER NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_verse_notes_location ON verse_notes(book, chapter, verse);

  CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS collection_verses (
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    book INTEGER NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (collection_id, book, chapter, verse)
  );
  CREATE INDEX IF NOT EXISTS idx_collection_verses_location ON collection_verses(book, chapter, verse);

  CREATE TABLE IF NOT EXISTS verse_markers (
    id TEXT PRIMARY KEY,
    book INTEGER NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    color TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(book, chapter, verse, color)
  );
  CREATE INDEX IF NOT EXISTS idx_verse_markers_chapter ON verse_markers(book, chapter);

  CREATE TABLE IF NOT EXISTS egw_notes (
    id TEXT PRIMARY KEY,
    book_code TEXT NOT NULL,
    puborder INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_egw_notes_location ON egw_notes(book_code, puborder);

  CREATE TABLE IF NOT EXISTS egw_markers (
    id TEXT PRIMARY KEY,
    book_code TEXT NOT NULL,
    puborder INTEGER NOT NULL,
    color TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(book_code, puborder, color)
  );
  CREATE INDEX IF NOT EXISTS idx_egw_markers_location ON egw_markers(book_code, puborder);

  CREATE TABLE IF NOT EXISTS egw_collection_items (
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    book_code TEXT NOT NULL,
    puborder INTEGER NOT NULL,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (collection_id, book_code, puborder)
  );
  CREATE INDEX IF NOT EXISTS idx_egw_collection_items_location ON egw_collection_items(book_code, puborder);

  CREATE TABLE IF NOT EXISTS reading_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'custom',
    source_id TEXT,
    start_date INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reading_plan_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id TEXT NOT NULL REFERENCES reading_plans(id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL,
    book INTEGER NOT NULL,
    start_chapter INTEGER NOT NULL,
    end_chapter INTEGER,
    label TEXT,
    UNIQUE(plan_id, day_number, book, start_chapter)
  );
  CREATE INDEX IF NOT EXISTS idx_plan_items_plan ON reading_plan_items(plan_id, day_number);

  CREATE TABLE IF NOT EXISTS reading_plan_progress (
    plan_id TEXT NOT NULL REFERENCES reading_plans(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES reading_plan_items(id) ON DELETE CASCADE,
    completed_at INTEGER NOT NULL,
    PRIMARY KEY (plan_id, item_id)
  );

  CREATE TABLE IF NOT EXISTS memory_verses (
    id TEXT PRIMARY KEY,
    book INTEGER NOT NULL,
    chapter INTEGER NOT NULL,
    verse_start INTEGER NOT NULL,
    verse_end INTEGER,
    created_at INTEGER NOT NULL,
    UNIQUE(book, chapter, verse_start)
  );

  CREATE TABLE IF NOT EXISTS memory_practice (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    verse_id TEXT NOT NULL REFERENCES memory_verses(id) ON DELETE CASCADE,
    mode TEXT NOT NULL,
    score REAL,
    practiced_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_memory_practice_verse ON memory_practice(verse_id, practiced_at DESC);
`;

const EGW_SCHEMA = `
  CREATE TABLE IF NOT EXISTS books (
    book_id INTEGER PRIMARY KEY,
    book_code TEXT NOT NULL,
    book_title TEXT NOT NULL,
    book_author TEXT NOT NULL,
    paragraph_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_books_code ON books(book_code);

  CREATE TABLE IF NOT EXISTS paragraphs (
    book_id INTEGER NOT NULL,
    ref_code TEXT NOT NULL,
    para_id TEXT,
    refcode_short TEXT,
    refcode_long TEXT,
    nodes_json TEXT NOT NULL,
    content_text TEXT NOT NULL,
    puborder INTEGER NOT NULL,
    element_type TEXT,
    element_subtype TEXT,
    page_number INTEGER,
    paragraph_number INTEGER,
    is_chapter_heading INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (book_id, ref_code),
    FOREIGN KEY (book_id) REFERENCES books(book_id)
  );
  CREATE INDEX IF NOT EXISTS idx_paragraphs_book_id ON paragraphs(book_id);
  CREATE INDEX IF NOT EXISTS idx_paragraphs_puborder ON paragraphs(book_id, puborder);
  CREATE INDEX IF NOT EXISTS idx_paragraphs_page ON paragraphs(book_id, page_number);

  CREATE TABLE IF NOT EXISTS paragraph_bible_refs (
    para_book_id INTEGER NOT NULL,
    para_ref_code TEXT NOT NULL,
    bible_book INTEGER NOT NULL,
    bible_chapter INTEGER NOT NULL,
    bible_verse INTEGER,
    PRIMARY KEY (para_book_id, para_ref_code, bible_book, bible_chapter, bible_verse),
    FOREIGN KEY (para_book_id, para_ref_code) REFERENCES paragraphs(book_id, ref_code)
  );
  CREATE INDEX IF NOT EXISTS idx_pbr_bible
    ON paragraph_bible_refs(bible_book, bible_chapter, bible_verse);

  CREATE TABLE IF NOT EXISTS sync_status (
    book_id INTEGER PRIMARY KEY,
    book_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    last_attempt TEXT NOT NULL,
    paragraph_count INTEGER DEFAULT 0
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS paragraphs_fts USING fts5(
    content_text,
    refcode_short,
    book_id UNINDEXED,
    content_rowid='rowid',
    tokenize='unicode61'
  );
`;

// Bible Commentary volumes to auto-sync
const BC_VOLUMES = ['1BC', '2BC', '3BC', '4BC', '5BC', '6BC', '7BC'];

async function execQuery(
  db: number,
  sql: string,
  params?: unknown[],
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for await (const stmt of sqlite3.statements(db, sql)) {
    if (params?.length) {
      sqlite3.bind_collection(stmt, params as (SQLiteCompatibleType | null)[]);
    }
    const columns = sqlite3.column_names(stmt);
    // eslint-disable-next-line no-await-in-loop -- sequential SQLite iteration
    while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
      const row: Record<string, unknown> = {};
      const values = sqlite3.row(stmt);
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        if (col === undefined) continue;
        row[col] = values[i];
      }
      rows.push(row);
    }
  }
  return rows;
}

async function execWrite(db: number, sql: string, params?: unknown[]): Promise<number> {
  for await (const stmt of sqlite3.statements(db, sql)) {
    if (params?.length) {
      sqlite3.bind_collection(stmt, params as (SQLiteCompatibleType | null)[]);
    }
    await sqlite3.step(stmt);
  }
  return sqlite3.changes(db);
}

async function checkBibleDbExists(): Promise<boolean> {
  try {
    const rows = await execQuery(bibleDb, 'SELECT COUNT(*) as cnt FROM books');
    return (rows[0]?.['cnt'] as number) > 0;
  } catch {
    return false;
  }
}

async function downloadBibleDb(): Promise<void> {
  post({ type: 'init-progress', stage: 'Downloading Bible database...', progress: 0 });

  const response = await fetch('/api/db/bible');
  if (!response.ok) {
    throw new Error(`Failed to download bible.db: ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error('No response body for bible.db download');
  }

  await sqlite3.close(bibleDb);

  const contentLength = Number(response.headers.get('Content-Length') ?? 0);
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle('bible.db', { create: true });
  const writable = await fileHandle.createWritable();

  const reader = response.body.getReader();
  let received = 0;

  /* eslint-disable no-await-in-loop -- sequential stream read */
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    await writable.write(value);
    received += value.byteLength;
    if (contentLength > 0) {
      post({
        type: 'init-progress',
        stage: 'Downloading Bible database...',
        progress: Math.round((received / contentLength) * 100),
      });
    }
  }
  /* eslint-enable no-await-in-loop */

  await writable.close();

  // Reopen as readonly
  bibleDb = await sqlite3.open_v2('bible.db', SQLite.SQLITE_OPEN_READONLY, 'opfs-coop-sync');
}

// ---------------------------------------------------------------------------
// EGW FTS helpers
// ---------------------------------------------------------------------------

// Drops paragraph tables when the on-disk schema version doesn't match. Books
// + sync_status are preserved so the next sync run repopulates the new shape.
async function ensureEgwSchemaVersion(): Promise<void> {
  const versionRows = await execQuery(egwDb, 'PRAGMA user_version');
  const currentVersion = (versionRows[0]?.['user_version'] as number | undefined) ?? 0;
  if (currentVersion !== 0 && currentVersion !== EGW_SCHEMA_VERSION) {
    log(
      `[db-worker] EGW schema version mismatch (${currentVersion} -> ${EGW_SCHEMA_VERSION}), dropping paragraph tables`,
    );
    await execWrite(egwDb, 'DROP TABLE IF EXISTS paragraphs_fts');
    await execWrite(egwDb, 'DROP TABLE IF EXISTS paragraph_bible_refs');
    await execWrite(egwDb, 'DROP TABLE IF EXISTS paragraphs');
    await execWrite(egwDb, "UPDATE sync_status SET status = 'pending'").catch(() => {});
  }
  await execWrite(egwDb, `PRAGMA user_version = ${EGW_SCHEMA_VERSION}`);
}

async function rebuildFtsForBook(bookId: number): Promise<void> {
  // Delete existing FTS entries for this book, then re-insert
  await execWrite(egwDb, `DELETE FROM paragraphs_fts WHERE book_id = ?`, [bookId]);
  await execWrite(
    egwDb,
    `INSERT INTO paragraphs_fts(rowid, content_text, refcode_short, book_id)
     SELECT rowid, content_text, refcode_short, book_id
     FROM paragraphs WHERE book_id = ?`,
    [bookId],
  );
}

async function rebuildAllFts(): Promise<void> {
  // Full rebuild: clear + re-insert all
  await execWrite(egwDb, `DELETE FROM paragraphs_fts`);
  await execWrite(
    egwDb,
    `INSERT INTO paragraphs_fts(rowid, content_text, refcode_short, book_id)
     SELECT rowid, content_text, refcode_short, book_id
     FROM paragraphs`,
  );
  log('[db-worker] FTS: full rebuild complete');
}

// ---------------------------------------------------------------------------
// EGW incremental sync
// ---------------------------------------------------------------------------

async function isBookSynced(bookCode: string): Promise<boolean> {
  try {
    const rows = await execQuery(
      egwDb,
      "SELECT status FROM sync_status WHERE book_code = ? AND status = 'success'",
      [bookCode],
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function getEgwSyncStatus(): Promise<
  { bookCode: string; status: string; paragraphCount: number }[]
> {
  try {
    const rows = await execQuery(
      egwDb,
      'SELECT book_code, status, paragraph_count FROM sync_status ORDER BY book_code',
    );
    return rows.map((r) => ({
      bookCode: r['book_code'] as string,
      status: r['status'] as string,
      paragraphCount: r['paragraph_count'] as number,
    }));
  } catch {
    return [];
  }
}

async function syncBook(bookCode: string, _requestId?: number): Promise<number> {
  // Check if already synced
  if (await isBookSynced(bookCode)) {
    log(`[db-worker] sync: ${bookCode} already synced, skipping`);
    return 0;
  }

  post({ type: 'sync-book-progress', bookCode, stage: 'Fetching...', progress: 0 });

  const response = await fetch(`/api/egw/${encodeURIComponent(bookCode)}/dump`);
  if (!response.ok) {
    const errMsg = `Failed to fetch ${bookCode}: ${response.statusText}`;
    throw new Error(errMsg);
  }

  post({ type: 'sync-book-progress', bookCode, stage: 'Parsing...', progress: 30 });
  const dump = await response.json();

  const book = dump.book;
  const paragraphs = dump.paragraphs as {
    refCode: string;
    paraId: string | null;
    refcodeShort: string | null;
    refcodeLong: string | null;
    nodes: readonly Node[];
    puborder: number;
    elementType: string | null;
    elementSubtype: string | null;
    pageNumber: number | null;
    paragraphNumber: number | null;
    isChapterHeading: boolean;
  }[];
  const bibleRefs = dump.bibleRefs as {
    refCode: string;
    bibleBook: number;
    bibleChapter: number;
    bibleVerse: number | null;
  }[];

  post({ type: 'sync-book-progress', bookCode, stage: 'Inserting...', progress: 50 });

  const now = new Date().toISOString();

  // Transaction: insert book, paragraphs, bible refs, sync status
  await execWrite(egwDb, 'BEGIN IMMEDIATE');
  try {
    // Upsert book
    await execWrite(
      egwDb,
      `INSERT INTO books (book_id, book_code, book_title, book_author, paragraph_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(book_id) DO UPDATE SET
         book_code = excluded.book_code,
         book_title = excluded.book_title,
         book_author = excluded.book_author,
         paragraph_count = excluded.paragraph_count`,
      [book.bookId, book.bookCode, book.title, book.author, paragraphs.length, now],
    );

    // Insert paragraphs and bible refs (sequential — SQLite single-writer)
    /* eslint-disable no-await-in-loop */
    for (const p of paragraphs) {
      await execWrite(
        egwDb,
        `INSERT OR REPLACE INTO paragraphs
         (book_id, ref_code, para_id, refcode_short, refcode_long, nodes_json, content_text,
          puborder, element_type, element_subtype, page_number, paragraph_number,
          is_chapter_heading, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          book.bookId,
          p.refCode,
          p.paraId,
          p.refcodeShort,
          p.refcodeLong,
          JSON.stringify(p.nodes),
          nodesToText(p.nodes),
          p.puborder,
          p.elementType,
          p.elementSubtype,
          p.pageNumber,
          p.paragraphNumber,
          p.isChapterHeading ? 1 : 0,
          now,
          now,
        ],
      );
    }

    post({ type: 'sync-book-progress', bookCode, stage: 'Bible refs...', progress: 80 });

    for (const r of bibleRefs) {
      await execWrite(
        egwDb,
        `INSERT OR IGNORE INTO paragraph_bible_refs
         (para_book_id, para_ref_code, bible_book, bible_chapter, bible_verse)
         VALUES (?, ?, ?, ?, ?)`,
        [book.bookId, r.refCode, r.bibleBook, r.bibleChapter, r.bibleVerse],
      );
    }
    /* eslint-enable no-await-in-loop */

    // Update sync status
    await execWrite(
      egwDb,
      `INSERT INTO sync_status (book_id, book_code, status, last_attempt, paragraph_count)
       VALUES (?, ?, 'success', ?, ?)
       ON CONFLICT(book_id) DO UPDATE SET
         status = 'success',
         error_message = NULL,
         last_attempt = excluded.last_attempt,
         paragraph_count = excluded.paragraph_count`,
      [book.bookId, bookCode, now, paragraphs.length],
    );

    await execWrite(egwDb, 'COMMIT');
  } catch (e) {
    await execWrite(egwDb, 'ROLLBACK').catch(() => {});
    throw e;
  }

  // Rebuild FTS index for this book's paragraphs
  post({ type: 'sync-book-progress', bookCode, stage: 'Indexing...', progress: 95 });
  await rebuildFtsForBook(book.bookId);

  post({ type: 'sync-book-progress', bookCode, stage: 'Done', progress: 100 });
  log(`[db-worker] sync: ${bookCode} done — ${paragraphs.length} paragraphs`);
  return paragraphs.length;
}

async function syncFullEgw(): Promise<void> {
  post({ type: 'init-progress', stage: 'Downloading EGW commentary...', progress: 0 });

  const response = await fetch('/api/db/egw');
  if (!response.ok) {
    throw new Error(`Failed to download egw-paragraphs.db: ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error('No response body for egw-paragraphs.db download');
  }

  await sqlite3.close(egwDb);

  const contentLength = Number(response.headers.get('Content-Length') ?? 0);
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle('egw-paragraphs.db', { create: true });
  const writable = await fileHandle.createWritable();

  const reader = response.body.getReader();
  let received = 0;

  /* eslint-disable no-await-in-loop -- sequential stream read */
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    await writable.write(value);
    received += value.byteLength;
    if (contentLength > 0) {
      post({
        type: 'init-progress',
        stage: 'Downloading EGW commentary...',
        progress: Math.round((received / contentLength) * 100),
      });
    }
  }
  /* eslint-enable no-await-in-loop */

  await writable.close();

  // Reopen read-write (schema might differ from incremental)
  egwDb = await sqlite3.open_v2(
    'egw-paragraphs.db',
    SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE,
    'opfs-coop-sync',
  );

  // Apply schema in case the downloaded db doesn't have sync_status
  await ensureEgwSchemaVersion();
  await sqlite3.exec(egwDb, EGW_SCHEMA);

  // Populate sync_status from existing books so the UI shows green dots
  await execWrite(
    egwDb,
    `INSERT OR REPLACE INTO sync_status (book_id, book_code, status, last_attempt, paragraph_count)
     SELECT book_id, book_code, 'success', ?, paragraph_count FROM books`,
    [new Date().toISOString()],
  );
  log('[db-worker] syncFullEgw: populated sync_status from books table');

  // Rebuild FTS index from all paragraphs
  await rebuildAllFts();
}

/**
 * Background auto-sync of BC volumes after init.
 * Non-blocking — runs sequentially, posting progress.
 */
async function autoSyncBcVolumes(): Promise<void> {
  /* eslint-disable no-await-in-loop */
  for (const bookCode of BC_VOLUMES) {
    try {
      if (await isBookSynced(bookCode)) continue;
      log(`[db-worker] auto-sync: starting ${bookCode}`);
      const count = await syncBook(bookCode);
      if (count > 0) {
        post({ type: 'sync-book-result', id: 0, bookCode, paragraphCount: count });
      }
    } catch (err) {
      console.warn(`[db-worker] auto-sync: ${bookCode} failed`, err);
      // Record failure but continue with other volumes
      // Use negative index as deterministic book_id so each volume gets its own failure row
      const failureId = -(BC_VOLUMES.indexOf(bookCode) + 1);
      try {
        await execWrite(
          egwDb,
          `INSERT INTO sync_status (book_id, book_code, status, error_message, last_attempt, paragraph_count)
           VALUES (?, ?, 'failed', ?, ?, 0)
           ON CONFLICT(book_id) DO UPDATE SET
             status = 'failed',
             error_message = excluded.error_message,
             last_attempt = excluded.last_attempt`,
          [
            failureId,
            bookCode,
            err instanceof Error ? err.message : String(err),
            new Date().toISOString(),
          ],
        );
      } catch {
        // ignore
      }
    }
  }
  /* eslint-enable no-await-in-loop */
}

// ---------------------------------------------------------------------------
// Topics database (lazy-loaded on first access)
// ---------------------------------------------------------------------------

// topics.db schema (pre-built, downloaded on first access):
// - topics (id, name, parent_id, description) + FTS5 on name/description
// - topic_verses (topic_id, book, chapter, verse_start, verse_end, note)

async function checkTopicsDbExists(): Promise<boolean> {
  if (!topicsDb) return false;
  try {
    const rows = await execQuery(topicsDb, 'SELECT COUNT(*) as cnt FROM topics');
    return (rows[0]?.['cnt'] as number) > 0;
  } catch {
    return false;
  }
}

async function downloadTopicsDb(): Promise<void> {
  post({ type: 'init-topics-progress', stage: 'Downloading topics database...', progress: 0 });

  const response = await fetch('/api/db/topics');
  if (!response.ok) {
    throw new Error(`Failed to download topics.db: ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error('No response body for topics.db download');
  }

  if (topicsDb) {
    await sqlite3.close(topicsDb);
    topicsDb = null;
  }

  const contentLength = Number(response.headers.get('Content-Length') ?? 0);
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle('topics.db', { create: true });
  const writable = await fileHandle.createWritable();

  const reader = response.body.getReader();
  let received = 0;

  /* eslint-disable no-await-in-loop -- sequential stream read */
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    await writable.write(value);
    received += value.byteLength;
    if (contentLength > 0) {
      post({
        type: 'init-topics-progress',
        stage: 'Downloading topics database...',
        progress: Math.round((received / contentLength) * 100),
      });
    }
  }
  /* eslint-enable no-await-in-loop */

  await writable.close();

  // Open as readonly
  topicsDb = await sqlite3.open_v2('topics.db', SQLite.SQLITE_OPEN_READONLY, 'opfs-coop-sync');
}

async function initTopics(): Promise<void> {
  try {
    // Try opening existing
    topicsDb = await sqlite3.open_v2(
      'topics.db',
      SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE,
      'opfs-coop-sync',
    );

    const hasData = await checkTopicsDbExists();
    if (!hasData) {
      await downloadTopicsDb();
    }

    post({ type: 'init-topics-complete' });
    log('[db-worker] topics.db ready');
  } catch (err) {
    console.error('[db-worker] topics init failed:', err);
    topicsDb = null;
    post({ type: 'init-topics-error', error: err instanceof Error ? err.message : String(err) });
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  try {
    log('[db-worker] init: loading wa-sqlite module');
    post({ type: 'init-progress', stage: 'Loading SQLite...', progress: 0 });

    const module = await SQLiteESMFactory();
    sqlite3 = SQLite.Factory(module);
    log('[db-worker] init: wa-sqlite loaded');

    const vfs = await OPFSCoopSyncVFS.create('opfs-coop-sync', module);
    sqlite3.vfs_register(vfs as unknown as SQLiteVFS, false);
    log('[db-worker] init: OPFS VFS registered');

    bibleDb = await sqlite3.open_v2(
      'bible.db',
      SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE,
      'opfs-coop-sync',
    );
    log('[db-worker] init: bible.db opened');

    const hasData = await checkBibleDbExists();
    log('[db-worker] init: bible.db hasData =', hasData);
    if (!hasData) {
      await downloadBibleDb();
      log('[db-worker] init: bible.db downloaded');
    }

    post({ type: 'init-progress', stage: 'Initializing...', progress: 100 });
    stateDb = await sqlite3.open_v2(
      'state.db',
      SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE,
      'opfs-coop-sync',
    );
    log('[db-worker] init: state.db opened, running schema');
    await sqlite3.exec(stateDb, 'PRAGMA foreign_keys = ON');
    await sqlite3.exec(stateDb, STATE_SCHEMA);
    log('[db-worker] init: state.db schema applied');

    // Migrations: add font preference columns (ALTER TABLE throws if column exists)
    /* eslint-disable no-await-in-loop -- sequential schema migrations */
    for (const col of [
      "ALTER TABLE preferences ADD COLUMN font_family TEXT NOT NULL DEFAULT 'Crimson Pro'",
      'ALTER TABLE preferences ADD COLUMN font_size REAL NOT NULL DEFAULT 18',
      'ALTER TABLE preferences ADD COLUMN line_height REAL NOT NULL DEFAULT 1.8',
      'ALTER TABLE preferences ADD COLUMN letter_spacing REAL NOT NULL DEFAULT 0.01',
    ]) {
      try {
        await sqlite3.exec(stateDb, col);
      } catch {
        // Column already exists — expected
      }
    }
    /* eslint-enable no-await-in-loop */
    log('[db-worker] init: state.db migrations applied');

    // EGW commentary database — schema-only init (no monolithic download)
    try {
      egwDb = await sqlite3.open_v2(
        'egw-paragraphs.db',
        SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE,
        'opfs-coop-sync',
      );
      await ensureEgwSchemaVersion();
      await sqlite3.exec(egwDb, EGW_SCHEMA);
      log('[db-worker] init: egw-paragraphs.db schema applied');

      // Ensure FTS index is populated (handles existing databases that lack FTS data)
      const ftsCount = await execQuery(egwDb, 'SELECT COUNT(*) as n FROM paragraphs_fts');
      const paraCount = await execQuery(egwDb, 'SELECT COUNT(*) as n FROM paragraphs');
      if ((paraCount[0]?.['n'] as number) > 0 && (ftsCount[0]?.['n'] as number) === 0) {
        log('[db-worker] init: FTS index empty, rebuilding...');
        await rebuildAllFts();
      }
    } catch (egwErr) {
      console.warn('[db-worker] init: EGW database unavailable, continuing without it', egwErr);
    }

    post({ type: 'init-complete' });
    log('[db-worker] init: complete');

    // Auto-sync BC volumes in background (non-blocking)
    autoSyncBcVolumes().catch((err) => {
      console.warn('[db-worker] auto-sync: failed', err);
    });
  } catch (err) {
    console.error('[db-worker] init: FAILED', err);
    post({ type: 'init-error', error: err instanceof Error ? err.message : String(err) });
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'init':
      await init();
      break;

    case 'query': {
      try {
        const db =
          msg.db === 'bible'
            ? bibleDb
            : msg.db === 'egw'
              ? egwDb
              : msg.db === 'topics'
                ? topicsDb
                : stateDb;
        if (db == null) {
          throw new Error(`Database '${msg.db}' is not initialized`);
        }
        const rows = await execQuery(db, msg.sql, msg.params);
        post({ type: 'query-result', id: msg.id, rows });
      } catch (err) {
        post({
          type: 'query-error',
          id: msg.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    case 'exec': {
      try {
        const changes = await execWrite(stateDb, msg.sql, msg.params);
        dirty = true;
        post({ type: 'exec-result', id: msg.id, changes });
      } catch (err) {
        post({
          type: 'exec-error',
          id: msg.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    case 'export-state': {
      try {
        const root = await navigator.storage.getDirectory();
        const handle = await root.getFileHandle('state.db');
        const file = await handle.getFile();
        const buffer = await file.arrayBuffer();
        dirty = false;
        const msg: WorkerResponse = { type: 'export-state-result', data: buffer };
        self.postMessage(msg, [buffer]);
      } catch (err) {
        post({
          type: 'export-state-error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    case 'is-dirty': {
      post({ type: 'is-dirty-result', dirty });
      break;
    }

    case 'sync-book': {
      try {
        const count = await syncBook(msg.bookCode, msg.id);
        post({
          type: 'sync-book-result',
          id: msg.id,
          bookCode: msg.bookCode,
          paragraphCount: count,
        });
      } catch (err) {
        post({
          type: 'sync-book-error',
          id: msg.id,
          bookCode: msg.bookCode,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    case 'get-egw-sync-status': {
      const books = await getEgwSyncStatus();
      post({ type: 'egw-sync-status', books });
      break;
    }

    case 'sync-full-egw': {
      try {
        await syncFullEgw();
        post({ type: 'sync-full-egw-result' });
      } catch (err) {
        post({
          type: 'sync-full-egw-error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    case 'init-topics': {
      await initTopics();
      break;
    }
  }
};
