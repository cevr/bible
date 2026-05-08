import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'os';
import { join } from 'path';

import { Database } from 'bun:sqlite';
import { Effect, Layer, Context } from 'effect';

import type { Bookmark, HistoryEntry, Position, Preferences, Reference } from './types.js';

// Local UUID generator — wraps node:crypto to keep the call site testable
// while still using the platform implementation.
const generateUuid = (): string => randomUUID();

// Cross-reference classification types
export const CROSS_REF_TYPES = [
  'quotation',
  'allusion',
  'parallel',
  'typological',
  'prophecy',
  'sanctuary',
  'recapitulation',
  'thematic',
] as const;
export type CrossRefType = (typeof CROSS_REF_TYPES)[number];

export interface CrossRefClassification {
  refBook: number;
  refChapter: number;
  refVerse: number | null;
  refVerseEnd: number | null;
  type: CrossRefType;
  confidence: number | null;
  classifiedAt: number;
}

export interface UserCrossRef {
  id: string;
  refBook: number;
  refChapter: number;
  refVerse: number | null;
  refVerseEnd: number | null;
  type: CrossRefType | null;
  note: string | null;
  createdAt: number;
}

// State storage directory
const STATE_DIR = join(homedir(), '.bible');
const DB_PATH = join(STATE_DIR, 'state.db');

// Ensure state directory exists
function ensureStateDir() {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }
}

// Initialize database with schema
function initDatabase(db: Database) {
  db.exec(`
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

    CREATE TABLE IF NOT EXISTS ai_search_cache (
      query TEXT PRIMARY KEY,
      results TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS terminal_palette (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      palette TEXT NOT NULL,
      is_dark INTEGER NOT NULL,
      cached_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS egw_position (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      book_code TEXT NOT NULL,
      page INTEGER,
      paragraph INTEGER,
      puborder INTEGER
    );

    -- Initialize default position if not exists
    INSERT OR IGNORE INTO position (id, book, chapter, verse) VALUES (1, 1, 1, 1);

    -- Initialize default preferences if not exists
    INSERT OR IGNORE INTO preferences (id, theme, display_mode) VALUES (1, 'system', 'verse');

    -- Create index for history queries
    CREATE INDEX IF NOT EXISTS idx_history_visited_at ON history(visited_at DESC);

    -- Cross-reference classifications (AI-generated, cached permanently)
    CREATE TABLE IF NOT EXISTS cross_ref_classifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_book INTEGER NOT NULL,
      source_chapter INTEGER NOT NULL,
      source_verse INTEGER NOT NULL,
      ref_book INTEGER NOT NULL,
      ref_chapter INTEGER NOT NULL,
      ref_verse INTEGER,
      ref_verse_end INTEGER,
      type TEXT NOT NULL,
      confidence REAL,
      classified_at INTEGER NOT NULL,
      UNIQUE(source_book, source_chapter, source_verse, ref_book, ref_chapter, COALESCE(ref_verse, 0))
    );

    CREATE INDEX IF NOT EXISTS idx_classifications_source
      ON cross_ref_classifications(source_book, source_chapter, source_verse);

    -- User-added cross-references
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
  `);
}

// Terminal palette cache
export interface CachedPalette {
  palette: string[];
  isDark: boolean;
}

// EGW position
export interface EGWPosition {
  bookCode: string;
  page?: number;
  paragraph?: number;
  puborder?: number;
}

// Service interface
export interface BibleStateService {
  readonly getLastPosition: () => Position;
  readonly setLastPosition: (pos: Position) => void;
  readonly getBookmarks: () => Bookmark[];
  readonly addBookmark: (ref: Reference, note?: string) => Bookmark;
  readonly removeBookmark: (id: string) => void;
  readonly getHistory: (limit?: number) => HistoryEntry[];
  readonly addToHistory: (ref: Reference) => void;
  readonly clearHistory: () => void;
  readonly getPreferences: () => Preferences;
  readonly setPreferences: (prefs: Partial<Preferences>) => void;
  readonly getCachedAISearch: (query: string) => Reference[] | undefined;
  readonly setCachedAISearch: (query: string, results: Reference[]) => void;
  readonly getCachedPalette: () => CachedPalette | undefined;
  readonly setCachedPalette: (palette: CachedPalette) => void;
  readonly getLastEGWPosition: () => EGWPosition | undefined;
  readonly setLastEGWPosition: (pos: EGWPosition) => void;
  readonly getClassifications: (
    book: number,
    chapter: number,
    verse: number,
  ) => CrossRefClassification[];
  readonly setClassifications: (
    book: number,
    chapter: number,
    verse: number,
    classifications: CrossRefClassification[],
  ) => void;
  readonly hasClassifications: (book: number, chapter: number, verse: number) => boolean;
  readonly getUserCrossRefs: (book: number, chapter: number, verse: number) => UserCrossRef[];
  readonly addUserCrossRef: (
    source: { book: number; chapter: number; verse: number },
    target: { book: number; chapter: number; verse?: number; verseEnd?: number },
    options?: { type?: CrossRefType; note?: string },
  ) => UserCrossRef;
  readonly removeUserCrossRef: (id: string) => void;
  readonly close: () => void;
}

// Effect service tag
export class BibleState extends Context.Service<BibleState, BibleStateService>()(
  '@bible/cli/data/bible/state/BibleState',
) {}

// Create the service implementation
function createBibleStateService(): BibleStateService {
  ensureStateDir();
  const db = new Database(DB_PATH);
  initDatabase(db);

  // Prepare statements for performance
  const getPositionStmt = db.prepare<Position, []>(
    'SELECT book, chapter, verse FROM position WHERE id = 1',
  );
  const setPositionStmt = db.prepare(
    'UPDATE position SET book = ?, chapter = ?, verse = ? WHERE id = 1',
  );

  const getBookmarksStmt = db.prepare<
    {
      id: string;
      book: number;
      chapter: number;
      verse: number | null;
      note: string | null;
      created_at: number;
    },
    []
  >('SELECT id, book, chapter, verse, note, created_at FROM bookmarks ORDER BY created_at DESC');
  const addBookmarkStmt = db.prepare(
    'INSERT INTO bookmarks (id, book, chapter, verse, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const removeBookmarkStmt = db.prepare('DELETE FROM bookmarks WHERE id = ?');

  const getHistoryStmt = db.prepare<
    { book: number; chapter: number; verse: number | null; visited_at: number },
    [number]
  >('SELECT book, chapter, verse, visited_at FROM history ORDER BY visited_at DESC LIMIT ?');
  const addHistoryStmt = db.prepare(
    'INSERT INTO history (book, chapter, verse, visited_at) VALUES (?, ?, ?, ?)',
  );
  const clearHistoryStmt = db.prepare('DELETE FROM history');

  const getPreferencesStmt = db.prepare<{ theme: string; display_mode: string }, []>(
    'SELECT theme, display_mode FROM preferences WHERE id = 1',
  );
  const setPreferencesStmt = db.prepare(
    'UPDATE preferences SET theme = ?, display_mode = ? WHERE id = 1',
  );

  const getCacheStmt = db.prepare<{ results: string; cached_at: number }, [string]>(
    'SELECT results, cached_at FROM ai_search_cache WHERE query = ?',
  );
  const setCacheStmt = db.prepare(
    'INSERT OR REPLACE INTO ai_search_cache (query, results, cached_at) VALUES (?, ?, ?)',
  );

  const getPaletteStmt = db.prepare<{ palette: string; is_dark: number; cached_at: number }, []>(
    'SELECT palette, is_dark, cached_at FROM terminal_palette WHERE id = 1',
  );
  const setPaletteStmt = db.prepare(
    'INSERT OR REPLACE INTO terminal_palette (id, palette, is_dark, cached_at) VALUES (1, ?, ?, ?)',
  );

  const getEGWPositionStmt = db.prepare<
    {
      book_code: string;
      page: number | null;
      paragraph: number | null;
      puborder: number | null;
    },
    []
  >('SELECT book_code, page, paragraph, puborder FROM egw_position WHERE id = 1');
  const setEGWPositionStmt = db.prepare(
    'INSERT OR REPLACE INTO egw_position (id, book_code, page, paragraph, puborder) VALUES (1, ?, ?, ?, ?)',
  );

  // Cross-reference classification statements
  const getClassificationsStmt = db.prepare<
    {
      ref_book: number;
      ref_chapter: number;
      ref_verse: number | null;
      ref_verse_end: number | null;
      type: string;
      confidence: number | null;
      classified_at: number;
    },
    [number, number, number]
  >(
    'SELECT ref_book, ref_chapter, ref_verse, ref_verse_end, type, confidence, classified_at FROM cross_ref_classifications WHERE source_book = ? AND source_chapter = ? AND source_verse = ?',
  );
  const hasClassificationsStmt = db.prepare<{ cnt: number }, [number, number, number]>(
    'SELECT COUNT(*) as cnt FROM cross_ref_classifications WHERE source_book = ? AND source_chapter = ? AND source_verse = ?',
  );
  const insertClassificationStmt = db.prepare(
    'INSERT OR REPLACE INTO cross_ref_classifications (source_book, source_chapter, source_verse, ref_book, ref_chapter, ref_verse, ref_verse_end, type, confidence, classified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );

  // User cross-ref statements
  const getUserCrossRefsStmt = db.prepare<
    {
      id: string;
      ref_book: number;
      ref_chapter: number;
      ref_verse: number | null;
      ref_verse_end: number | null;
      type: string | null;
      note: string | null;
      created_at: number;
    },
    [number, number, number]
  >(
    'SELECT id, ref_book, ref_chapter, ref_verse, ref_verse_end, type, note, created_at FROM user_cross_refs WHERE source_book = ? AND source_chapter = ? AND source_verse = ? ORDER BY created_at DESC',
  );
  const addUserCrossRefStmt = db.prepare(
    'INSERT INTO user_cross_refs (id, source_book, source_chapter, source_verse, ref_book, ref_chapter, ref_verse, ref_verse_end, type, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const removeUserCrossRefStmt = db.prepare('DELETE FROM user_cross_refs WHERE id = ?');

  // Cache expiry: 24 hours for AI search
  const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;
  // Palette cache: 7 days (terminal colors rarely change)
  const PALETTE_CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

  return {
    getLastPosition(): Position {
      const row = getPositionStmt.get();
      return row ?? { book: 1, chapter: 1, verse: 1 };
    },

    setLastPosition(pos: Position): void {
      setPositionStmt.run(pos.book, pos.chapter, pos.verse);
    },

    getBookmarks(): Bookmark[] {
      const rows = getBookmarksStmt.all();
      return rows.map((row) => ({
        id: row.id,
        reference: {
          book: row.book,
          chapter: row.chapter,
          verse: row.verse ?? undefined,
        },
        note: row.note ?? undefined,
        createdAt: row.created_at,
      }));
    },

    addBookmark(ref: Reference, note?: string): Bookmark {
      const id = generateUuid();
      const createdAt = Date.now();
      addBookmarkStmt.run(id, ref.book, ref.chapter, ref.verse ?? null, note ?? null, createdAt);
      return {
        id,
        reference: ref,
        note,
        createdAt,
      };
    },

    removeBookmark(id: string): void {
      removeBookmarkStmt.run(id);
    },

    getHistory(limit = 100): HistoryEntry[] {
      const rows = getHistoryStmt.all(limit);
      return rows.map((row) => ({
        reference: {
          book: row.book,
          chapter: row.chapter,
          verse: row.verse ?? undefined,
        },
        visitedAt: row.visited_at,
      }));
    },

    addToHistory(ref: Reference): void {
      addHistoryStmt.run(ref.book, ref.chapter, ref.verse ?? null, Date.now());
    },

    clearHistory(): void {
      clearHistoryStmt.run();
    },

    getPreferences(): Preferences {
      const row = getPreferencesStmt.get();
      return {
        theme: row?.theme ?? 'system',
        displayMode: (row?.display_mode as 'verse' | 'paragraph') ?? 'verse',
      };
    },

    setPreferences(prefs: Partial<Preferences>): void {
      const current = this.getPreferences();
      setPreferencesStmt.run(
        prefs.theme ?? current.theme,
        prefs.displayMode ?? current.displayMode,
      );
    },

    getCachedAISearch(query: string): Reference[] | undefined {
      const row = getCacheStmt.get(query.toLowerCase().trim());
      if (row === null) return undefined;

      // Check if cache is expired
      if (Date.now() - row.cached_at > CACHE_EXPIRY_MS) {
        return undefined;
      }

      try {
        return JSON.parse(row.results) as Reference[];
      } catch {
        return undefined;
      }
    },

    setCachedAISearch(query: string, results: Reference[]): void {
      setCacheStmt.run(query.toLowerCase().trim(), JSON.stringify(results), Date.now());
    },

    getCachedPalette(): CachedPalette | undefined {
      const row = getPaletteStmt.get();
      if (row === null) return undefined;

      // Check if cache is expired
      if (Date.now() - row.cached_at > PALETTE_CACHE_EXPIRY_MS) {
        return undefined;
      }

      try {
        return {
          palette: JSON.parse(row.palette) as string[],
          isDark: row.is_dark === 1,
        };
      } catch {
        return undefined;
      }
    },

    setCachedPalette(cached: CachedPalette): void {
      setPaletteStmt.run(JSON.stringify(cached.palette), cached.isDark ? 1 : 0, Date.now());
    },

    getLastEGWPosition(): EGWPosition | undefined {
      const row = getEGWPositionStmt.get();
      if (row === null) return undefined;
      return {
        bookCode: row.book_code,
        page: row.page ?? undefined,
        paragraph: row.paragraph ?? undefined,
        puborder: row.puborder ?? undefined,
      };
    },

    setLastEGWPosition(pos: EGWPosition): void {
      setEGWPositionStmt.run(
        pos.bookCode,
        pos.page ?? null,
        pos.paragraph ?? null,
        pos.puborder ?? null,
      );
    },

    getClassifications(book: number, chapter: number, verse: number): CrossRefClassification[] {
      const rows = getClassificationsStmt.all(book, chapter, verse);
      return rows.map((row) => ({
        refBook: row.ref_book,
        refChapter: row.ref_chapter,
        refVerse: row.ref_verse,
        refVerseEnd: row.ref_verse_end,
        type: row.type as CrossRefType,
        confidence: row.confidence,
        classifiedAt: row.classified_at,
      }));
    },

    setClassifications(
      book: number,
      chapter: number,
      verse: number,
      classifications: CrossRefClassification[],
    ): void {
      db.transaction(() => {
        for (const c of classifications) {
          insertClassificationStmt.run(
            book,
            chapter,
            verse,
            c.refBook,
            c.refChapter,
            c.refVerse ?? null,
            c.refVerseEnd ?? null,
            c.type,
            c.confidence ?? null,
            c.classifiedAt,
          );
        }
      })();
    },

    hasClassifications(book: number, chapter: number, verse: number): boolean {
      const row = hasClassificationsStmt.get(book, chapter, verse);
      return row !== null && row.cnt > 0;
    },

    getUserCrossRefs(book: number, chapter: number, verse: number): UserCrossRef[] {
      const rows = getUserCrossRefsStmt.all(book, chapter, verse);
      return rows.map((row) => ({
        id: row.id,
        refBook: row.ref_book,
        refChapter: row.ref_chapter,
        refVerse: row.ref_verse,
        refVerseEnd: row.ref_verse_end,
        type: row.type as CrossRefType | null,
        note: row.note,
        createdAt: row.created_at,
      }));
    },

    addUserCrossRef(
      source: { book: number; chapter: number; verse: number },
      target: { book: number; chapter: number; verse?: number; verseEnd?: number },
      options?: { type?: CrossRefType; note?: string },
    ): UserCrossRef {
      const id = generateUuid();
      const createdAt = Date.now();
      addUserCrossRefStmt.run(
        id,
        source.book,
        source.chapter,
        source.verse,
        target.book,
        target.chapter,
        target.verse ?? null,
        target.verseEnd ?? null,
        options?.type ?? null,
        options?.note ?? null,
        createdAt,
      );
      return {
        id,
        refBook: target.book,
        refChapter: target.chapter,
        refVerse: target.verse ?? null,
        refVerseEnd: target.verseEnd ?? null,
        type: options?.type ?? null,
        note: options?.note ?? null,
        createdAt,
      };
    },

    removeUserCrossRef(id: string): void {
      removeUserCrossRefStmt.run(id);
    },

    close(): void {
      db.close();
    },
  };
}

// Live layer with proper scoping - use Effect.scoped to manage lifecycle
export const BibleStateLive = Layer.effect(
  BibleState,
  Effect.acquireRelease(
    Effect.sync(() => createBibleStateService()),
    (service) => Effect.sync(() => service.close()),
  ),
);
