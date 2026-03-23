import { Effect, Layer, ServiceMap } from 'effect';
import type { Reference } from '../bible/types';
import { DbClientService } from '../db-client-service';
import type { DatabaseQueryError } from '../errors';

export interface Position {
  book: number;
  chapter: number;
  verse: number;
}

export interface Bookmark {
  id: string;
  reference: Reference;
  note?: string;
  createdAt: number;
}

export interface HistoryEntry {
  reference: Reference;
  visitedAt: number;
}

export interface Preferences {
  theme: 'light' | 'dark' | 'system';
  displayMode: 'verse' | 'paragraph';
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
}

const DEFAULT_POSITION: Position = { book: 1, chapter: 1, verse: 1 };
const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  displayMode: 'verse',
  fontFamily: 'Crimson Pro',
  fontSize: 18,
  lineHeight: 1.8,
  letterSpacing: 0.01,
};

interface PositionRow {
  book: number;
  chapter: number;
  verse: number;
}

interface BookmarkRow {
  id: string;
  book: number;
  chapter: number;
  verse: number | null;
  note: string | null;
  created_at: number;
}

interface HistoryRow {
  book: number;
  chapter: number;
  verse: number | null;
  visited_at: number;
}

interface PreferencesRow {
  theme: string;
  display_mode: string;
  font_family: string;
  font_size: number;
  line_height: number;
  letter_spacing: number;
}

interface AppStateServiceShape {
  readonly getPosition: () => Effect.Effect<Position, DatabaseQueryError>;
  readonly setPosition: (pos: Position) => Effect.Effect<void, DatabaseQueryError>;
  readonly getBookmarks: () => Effect.Effect<Bookmark[], DatabaseQueryError>;
  readonly addBookmark: (
    ref: Reference,
    note?: string,
  ) => Effect.Effect<Bookmark, DatabaseQueryError>;
  readonly removeBookmark: (id: string) => Effect.Effect<void, DatabaseQueryError>;
  readonly getHistory: (limit?: number) => Effect.Effect<HistoryEntry[], DatabaseQueryError>;
  readonly addToHistory: (ref: Reference) => Effect.Effect<void, DatabaseQueryError>;
  readonly clearHistory: () => Effect.Effect<void, DatabaseQueryError>;
  readonly getPreferences: () => Effect.Effect<Preferences, DatabaseQueryError>;
  readonly setPreferences: (prefs: Partial<Preferences>) => Effect.Effect<void, DatabaseQueryError>;
}

export class AppStateService extends ServiceMap.Service<AppStateService, AppStateServiceShape>()(
  '@bible-web/AppState',
) {
  static Live = Layer.effect(
    AppStateService,
    Effect.gen(function* () {
      const db = yield* DbClientService;

      const getPosition = Effect.fn('AppStateService.getPosition')(function* () {
        const rows = yield* db.query<PositionRow>(
          'state',
          'SELECT book, chapter, verse FROM position WHERE id = 1',
        );
        return rows[0] ?? DEFAULT_POSITION;
      });

      const setPosition = Effect.fn('AppStateService.setPosition')(function* (pos: Position) {
        yield* db.exec('UPDATE position SET book = ?, chapter = ?, verse = ? WHERE id = 1', [
          pos.book,
          pos.chapter,
          pos.verse,
        ]);
      });

      const getBookmarks = Effect.fn('AppStateService.getBookmarks')(function* () {
        const rows = yield* db.query<BookmarkRow>(
          'state',
          'SELECT id, book, chapter, verse, note, created_at FROM bookmarks ORDER BY created_at DESC',
        );
        return rows.map(
          (r): Bookmark => ({
            id: r.id,
            reference: { book: r.book, chapter: r.chapter, verse: r.verse ?? undefined },
            note: r.note ?? undefined,
            createdAt: r.created_at,
          }),
        );
      });

      const addBookmark = Effect.fn('AppStateService.addBookmark')(function* (
        ref: Reference,
        note?: string,
      ) {
        const id = crypto.randomUUID();
        const createdAt = Date.now();
        yield* db.exec(
          'INSERT INTO bookmarks (id, book, chapter, verse, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [id, ref.book, ref.chapter, ref.verse ?? null, note ?? null, createdAt],
        );
        return { id, reference: ref, note, createdAt } satisfies Bookmark;
      });

      const removeBookmark = Effect.fn('AppStateService.removeBookmark')(function* (id: string) {
        yield* db.exec('DELETE FROM bookmarks WHERE id = ?', [id]);
      });

      const getHistory = Effect.fn('AppStateService.getHistory')(function* (limit = 100) {
        const rows = yield* db.query<HistoryRow>(
          'state',
          'SELECT book, chapter, verse, visited_at FROM history ORDER BY visited_at DESC LIMIT ?',
          [limit],
        );
        return rows.map(
          (r): HistoryEntry => ({
            reference: { book: r.book, chapter: r.chapter, verse: r.verse ?? undefined },
            visitedAt: r.visited_at,
          }),
        );
      });

      const addToHistory = Effect.fn('AppStateService.addToHistory')(function* (ref: Reference) {
        yield* db.exec(
          'INSERT INTO history (book, chapter, verse, visited_at) VALUES (?, ?, ?, ?)',
          [ref.book, ref.chapter, ref.verse ?? null, Date.now()],
        );
        yield* db.exec(
          'DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY visited_at DESC LIMIT 100)',
        );
      });

      const clearHistory = Effect.fn('AppStateService.clearHistory')(function* () {
        yield* db.exec('DELETE FROM history');
      });

      const getPreferences = Effect.fn('AppStateService.getPreferences')(function* () {
        const rows = yield* db.query<PreferencesRow>(
          'state',
          'SELECT theme, display_mode, font_family, font_size, line_height, letter_spacing FROM preferences WHERE id = 1',
        );
        const row = rows[0];
        if (!row) return DEFAULT_PREFERENCES;
        return {
          theme: row.theme as Preferences['theme'],
          displayMode: row.display_mode as Preferences['displayMode'],
          fontFamily: row.font_family ?? DEFAULT_PREFERENCES.fontFamily,
          fontSize: row.font_size ?? DEFAULT_PREFERENCES.fontSize,
          lineHeight: row.line_height ?? DEFAULT_PREFERENCES.lineHeight,
          letterSpacing: row.letter_spacing ?? DEFAULT_PREFERENCES.letterSpacing,
        } satisfies Preferences;
      });

      const setPreferences = Effect.fn('AppStateService.setPreferences')(function* (
        prefs: Partial<Preferences>,
      ) {
        const current = yield* getPreferences();
        const updated = { ...current, ...prefs };
        yield* db.exec(
          'UPDATE preferences SET theme = ?, display_mode = ?, font_family = ?, font_size = ?, line_height = ?, letter_spacing = ? WHERE id = 1',
          [
            updated.theme,
            updated.displayMode,
            updated.fontFamily,
            updated.fontSize,
            updated.lineHeight,
            updated.letterSpacing,
          ],
        );
      });

      return AppStateService.of({
        getPosition,
        setPosition,
        getBookmarks,
        addBookmark,
        removeBookmark,
        getHistory,
        addToHistory,
        clearHistory,
        getPreferences,
        setPreferences,
      });
    }),
  );
}
