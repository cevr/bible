import { Effect, Layer, Context, Schema } from 'effect';
import type { Reference } from '../bible/types';
import { DbClientService } from '../db-client-service';

export class StateDataError extends Schema.TaggedErrorClass<StateDataError>()('StateDataError', {
  cause: Schema.Unknown,
  operation: Schema.String,
}) {}

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

export const Theme = Schema.Literals(['light', 'dark', 'system']);
export type Theme = typeof Theme.Type;

export const DisplayMode = Schema.Literals(['verse', 'paragraph']);
export type DisplayMode = typeof DisplayMode.Type;

export interface Preferences {
  theme: Theme;
  displayMode: DisplayMode;
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

const PositionRow = Schema.Struct({
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.Number,
});

const BookmarkRow = Schema.Struct({
  id: Schema.String,
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.NullOr(Schema.Number),
  note: Schema.NullOr(Schema.String),
  created_at: Schema.Number,
});

const HistoryRow = Schema.Struct({
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.NullOr(Schema.Number),
  visited_at: Schema.Number,
});

const PreferencesRow = Schema.Struct({
  theme: Theme,
  display_mode: DisplayMode,
  font_family: Schema.String,
  font_size: Schema.Number,
  line_height: Schema.Number,
  letter_spacing: Schema.Number,
});

interface AppStateServiceShape {
  readonly getPosition: () => Effect.Effect<Position, StateDataError>;
  readonly setPosition: (pos: Position) => Effect.Effect<void, StateDataError>;
  readonly getBookmarks: () => Effect.Effect<Bookmark[], StateDataError>;
  readonly addBookmark: (ref: Reference, note?: string) => Effect.Effect<Bookmark, StateDataError>;
  readonly removeBookmark: (id: string) => Effect.Effect<void, StateDataError>;
  readonly getHistory: (limit?: number) => Effect.Effect<HistoryEntry[], StateDataError>;
  readonly addToHistory: (ref: Reference) => Effect.Effect<void, StateDataError>;
  readonly clearHistory: () => Effect.Effect<void, StateDataError>;
  readonly getPreferences: () => Effect.Effect<Preferences, StateDataError>;
  readonly setPreferences: (prefs: Partial<Preferences>) => Effect.Effect<void, StateDataError>;
}

export class AppStateService extends Context.Service<AppStateService, AppStateServiceShape>()(
  '@bible-web/AppState',
) {
  static Live = Layer.effect(
    AppStateService,
    Effect.gen(function* () {
      const db = yield* DbClientService;

      const getPosition = Effect.fn('AppStateService.getPosition')(function* () {
        const rows = yield* db.query(
          PositionRow,
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
        const rows = yield* db.query(
          BookmarkRow,
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
        const rows = yield* db.query(
          HistoryRow,
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
        const rows = yield* db.query(
          PreferencesRow,
          'state',
          'SELECT theme, display_mode, font_family, font_size, line_height, letter_spacing FROM preferences WHERE id = 1',
        );
        const row = rows[0];
        if (!row) return DEFAULT_PREFERENCES;
        return {
          theme: row.theme,
          displayMode: row.display_mode,
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

      const mapDataError = <A>(operation: string, effect: Effect.Effect<A, unknown>) =>
        effect.pipe(Effect.mapError((cause) => new StateDataError({ cause, operation })));

      return AppStateService.of({
        getPosition: () => mapDataError('getPosition', getPosition()),
        setPosition: (position) => mapDataError('setPosition', setPosition(position)),
        getBookmarks: () => mapDataError('getBookmarks', getBookmarks()),
        addBookmark: (reference, note) => mapDataError('addBookmark', addBookmark(reference, note)),
        removeBookmark: (id) => mapDataError('removeBookmark', removeBookmark(id)),
        getHistory: (limit) => mapDataError('getHistory', getHistory(limit)),
        addToHistory: (reference) => mapDataError('addToHistory', addToHistory(reference)),
        clearHistory: () => mapDataError('clearHistory', clearHistory()),
        getPreferences: () => mapDataError('getPreferences', getPreferences()),
        setPreferences: (preferences) =>
          mapDataError('setPreferences', setPreferences(preferences)),
      });
    }),
  );
}
