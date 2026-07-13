import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'os';
import { join } from 'path';

import { Reference, type VerseReference } from '@bible/core/bible';
import { CrossRefType } from '@bible/core/bible-cross-refs';
import { Reference as WritingsReference, type ParagraphReference } from '@bible/core/writings';
import { Database } from 'bun:sqlite';
import { Effect, Layer, Context, Option, Schema } from 'effect';

import {
  ReaderReference,
  type ReaderReference as ReaderReferenceType,
} from '../../app/reader-reference.js';

const DisplayMode = Schema.Literals(['verse', 'paragraph']);
const Preferences = Schema.Struct({ theme: Schema.String, displayMode: DisplayMode });
type Preferences = typeof Preferences.Type;

const CachedBibleReferences = Schema.fromJsonString(Schema.Array(ReaderReference));
const decodeCachedBibleReferences = Schema.decodeUnknownOption(CachedBibleReferences);
const encodeCachedBibleReferences = Schema.encodeSync(CachedBibleReferences);
const decodeDisplayMode = Schema.decodeUnknownOption(DisplayMode);
const CachedPalette = Schema.fromJsonString(Schema.Array(Schema.String));
const decodeCachedPalette = Schema.decodeUnknownOption(CachedPalette);
const encodeCachedPalette = Schema.encodeSync(CachedPalette);
const decodeCrossRefType = Schema.decodeUnknownSync(CrossRefType);

// Local UUID generator — wraps node:crypto to keep the call site testable
// while still using the platform implementation.
const generateUuid = (): string => randomUUID();

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
      classified_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_classifications_source
      ON cross_ref_classifications(source_book, source_chapter, source_verse);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_classifications_unique_reference
      ON cross_ref_classifications(
        source_book,
        source_chapter,
        source_verse,
        ref_book,
        ref_chapter,
        COALESCE(ref_verse, 0)
      );

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
interface CachedPalette {
  readonly palette: readonly string[];
  readonly isDark: boolean;
}

// Service interface
export interface BibleStateService {
  readonly reader: {
    readonly bible: {
      readonly loadPosition: () => VerseReference;
      readonly savePosition: (position: VerseReference) => void;
    };
    readonly writings: {
      readonly loadPosition: () => ParagraphReference | undefined;
      readonly savePosition: (reference: ParagraphReference) => void;
    };
  };
  readonly preferences: {
    readonly get: () => Preferences;
    readonly update: (preferences: Partial<Preferences>) => void;
    readonly getTerminalPalette: () => CachedPalette | undefined;
    readonly saveTerminalPalette: (palette: CachedPalette) => void;
  };
  readonly aiSearch: {
    readonly getCached: (query: string) => readonly ReaderReferenceType[] | undefined;
    readonly saveCached: (query: string, results: readonly ReaderReferenceType[]) => void;
  };
  readonly crossReferences: {
    readonly classificationsFor: (
      book: number,
      chapter: number,
      verse: number,
    ) => CrossRefClassification[];
    readonly saveClassifications: (
      book: number,
      chapter: number,
      verse: number,
      classifications: readonly CrossRefClassification[],
    ) => void;
    readonly hasClassifications: (book: number, chapter: number, verse: number) => boolean;
    readonly userReferencesFor: (book: number, chapter: number, verse: number) => UserCrossRef[];
    readonly addUserReference: (
      source: { readonly book: number; readonly chapter: number; readonly verse: number },
      target: {
        readonly book: number;
        readonly chapter: number;
        readonly verse?: number;
        readonly verseEnd?: number;
      },
      options?: { readonly type?: CrossRefType; readonly note?: string },
    ) => UserCrossRef;
    readonly removeUserReference: (id: string) => void;
  };
}

// Effect service tag
export class BibleState extends Context.Service<BibleState, BibleStateService>()(
  '@bible/cli/data/bible/state/BibleState',
) {}

// Create the service implementation
interface BibleStateResource extends BibleStateService {
  readonly close: () => void;
}

function createBibleStateService(): BibleStateResource {
  ensureStateDir();
  const db = new Database(DB_PATH);
  initDatabase(db);

  // Prepare statements for performance
  const getPositionStmt = db.prepare<{ book: number; chapter: number; verse: number }, []>(
    'SELECT book, chapter, verse FROM position WHERE id = 1',
  );
  const setPositionStmt = db.prepare(
    'UPDATE position SET book = ?, chapter = ?, verse = ? WHERE id = 1',
  );

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

  const getPreferences = (): Preferences => {
    const row = getPreferencesStmt.get();
    return {
      theme: row?.theme ?? 'system',
      displayMode: Option.getOrElse(decodeDisplayMode(row?.display_mode), () => 'verse'),
    };
  };

  return {
    reader: {
      bible: {
        loadPosition: () => {
          const row = getPositionStmt.get();
          return row === null
            ? Reference.verse(1, 1, 1)
            : Reference.verse(row.book, row.chapter, row.verse);
        },
        savePosition: (position) => {
          setPositionStmt.run(position.book, position.chapter, position.verse);
        },
      },
      writings: {
        loadPosition: () => {
          const row = getEGWPositionStmt.get();
          if (row === null || row.puborder === null) return undefined;
          return WritingsReference.paragraph({
            publication: row.book_code,
            order: row.puborder,
            page: row.page ?? undefined,
            number: row.paragraph ?? undefined,
          });
        },
        savePosition: (reference) => {
          setEGWPositionStmt.run(
            reference.publication,
            Option.getOrNull(reference.page),
            Option.getOrNull(reference.number),
            reference.order,
          );
        },
      },
    },
    preferences: {
      get: getPreferences,
      update: (preferences) => {
        const current = getPreferences();
        setPreferencesStmt.run(
          preferences.theme ?? current.theme,
          preferences.displayMode ?? current.displayMode,
        );
      },
      getTerminalPalette: () => {
        const row = getPaletteStmt.get();
        if (row === null || Date.now() - row.cached_at > PALETTE_CACHE_EXPIRY_MS) {
          return undefined;
        }
        return Option.map(decodeCachedPalette(row.palette), (palette) => ({
          palette,
          isDark: row.is_dark === 1,
        })).pipe(Option.getOrUndefined);
      },
      saveTerminalPalette: (cached) => {
        setPaletteStmt.run(encodeCachedPalette(cached.palette), cached.isDark ? 1 : 0, Date.now());
      },
    },
    aiSearch: {
      getCached: (query) => {
        const row = getCacheStmt.get(query.toLowerCase().trim());
        if (row === null || Date.now() - row.cached_at > CACHE_EXPIRY_MS) return undefined;
        return Option.getOrUndefined(decodeCachedBibleReferences(row.results));
      },
      saveCached: (query, results) => {
        setCacheStmt.run(
          query.toLowerCase().trim(),
          encodeCachedBibleReferences(results),
          Date.now(),
        );
      },
    },
    crossReferences: {
      classificationsFor: (book, chapter, verse) =>
        getClassificationsStmt.all(book, chapter, verse).map((row) => ({
          refBook: row.ref_book,
          refChapter: row.ref_chapter,
          refVerse: row.ref_verse,
          refVerseEnd: row.ref_verse_end,
          type: decodeCrossRefType(row.type),
          confidence: row.confidence,
          classifiedAt: row.classified_at,
        })),
      saveClassifications: (book, chapter, verse, classifications) => {
        db.transaction(() => {
          for (const classification of classifications) {
            insertClassificationStmt.run(
              book,
              chapter,
              verse,
              classification.refBook,
              classification.refChapter,
              classification.refVerse,
              classification.refVerseEnd,
              classification.type,
              classification.confidence,
              classification.classifiedAt,
            );
          }
        })();
      },
      hasClassifications: (book, chapter, verse) => {
        const row = hasClassificationsStmt.get(book, chapter, verse);
        return row !== null && row.cnt > 0;
      },
      userReferencesFor: (book, chapter, verse) =>
        getUserCrossRefsStmt.all(book, chapter, verse).map((row) => ({
          id: row.id,
          refBook: row.ref_book,
          refChapter: row.ref_chapter,
          refVerse: row.ref_verse,
          refVerseEnd: row.ref_verse_end,
          type: row.type === null ? null : decodeCrossRefType(row.type),
          note: row.note,
          createdAt: row.created_at,
        })),
      addUserReference: (source, target, options) => {
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
      removeUserReference: (id) => {
        removeUserCrossRefStmt.run(id);
      },
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
    (resource) => Effect.sync(() => resource.close()),
  ),
);
