import * as SQLite from 'wa-sqlite';

import type { SqliteDatabase, SqliteRow } from './sqlite-database.js';

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

const PREFERENCE_MIGRATIONS = [
  "ALTER TABLE preferences ADD COLUMN font_family TEXT NOT NULL DEFAULT 'Crimson Pro'",
  'ALTER TABLE preferences ADD COLUMN font_size REAL NOT NULL DEFAULT 18',
  'ALTER TABLE preferences ADD COLUMN line_height REAL NOT NULL DEFAULT 1.8',
  'ALTER TABLE preferences ADD COLUMN letter_spacing REAL NOT NULL DEFAULT 0.01',
] as const;

export interface StateDatabase {
  initialize(): Promise<void>;
  query(sql: string, params?: readonly unknown[]): Promise<readonly SqliteRow[]>;
  execute(sql: string, params?: readonly unknown[]): Promise<number>;
  exportFile(): Promise<ArrayBuffer>;
  isDirty(): boolean;
}

interface StateFile {
  readonly arrayBuffer: () => Promise<ArrayBuffer>;
}

interface StateFileHandle {
  readonly getFile: () => Promise<StateFile>;
}

export interface StateFileDirectory {
  readonly getFileHandle: (filename: string) => Promise<StateFileHandle>;
}

export const makeStateDatabase = (options: {
  readonly database: SqliteDatabase;
  readonly getStorageRoot?: () => Promise<StateFileDirectory>;
}): StateDatabase => {
  let dirty = false;
  const getStorageRoot = options.getStorageRoot ?? (() => navigator.storage.getDirectory());

  const initialize = async (): Promise<void> => {
    await options.database.open(SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE);
    await options.database.exec('PRAGMA foreign_keys = ON');
    await options.database.exec(STATE_SCHEMA);

    /* eslint-disable no-await-in-loop -- sequential schema migrations */
    for (const migration of PREFERENCE_MIGRATIONS) {
      try {
        await options.database.exec(migration);
      } catch {
        // Column already exists — expected
      }
    }
    /* eslint-enable no-await-in-loop */
  };

  const query = (sql: string, params?: readonly unknown[]): Promise<readonly SqliteRow[]> =>
    options.database.query(sql, params);

  const execute = async (sql: string, params?: readonly unknown[]): Promise<number> => {
    const changes = await options.database.write(sql, params);
    dirty = true;
    return changes;
  };

  const exportFile = async (): Promise<ArrayBuffer> => {
    const root = await getStorageRoot();
    const handle = await root.getFileHandle('state.db');
    const file = await handle.getFile();
    const buffer = await file.arrayBuffer();
    dirty = false;
    return buffer;
  };

  return {
    initialize,
    query,
    execute,
    exportFile,
    isDirty: () => dirty,
  };
};
