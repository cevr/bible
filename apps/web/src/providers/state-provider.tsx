/**
 * State hooks — thin wrappers adding mutation + invalidation on top of CachedApp.
 *
 * Read methods are synchronous (suspend via CachedApp).
 * Write methods return Promise and invalidate the relevant cache.
 */
import { useApp } from './db-context';
import type { Position, Bookmark, HistoryEntry, Preferences } from '@/data/state/effect-service';
import type { Reference } from '@/data/bible/types';

export type { Position, Bookmark, HistoryEntry, Preferences };

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function usePosition() {
  const app = useApp();
  const position = app.state.position();

  return {
    position,
    async set(pos: Position) {
      await app.state.setPosition(pos);
      app.state.position.invalidateAll();
    },
  };
}

export function useBookmarks() {
  const app = useApp();
  const bookmarks = app.state.bookmarks();

  return {
    bookmarks,
    async add(ref: Reference, note?: string) {
      const bm = await app.state.addBookmark(ref, note);
      app.state.bookmarks.invalidateAll();
      return bm;
    },
    async remove(id: string) {
      await app.state.removeBookmark(id);
      app.state.bookmarks.invalidateAll();
    },
  };
}

export function useHistory() {
  const app = useApp();
  const history = app.state.history();

  return {
    history,
    async add(ref: Reference) {
      await app.state.addToHistory(ref);
      app.state.history.invalidateAll();
    },
    async clear() {
      await app.state.clearHistory();
      app.state.history.invalidateAll();
    },
  };
}

export function usePreferences() {
  const app = useApp();
  const preferences = app.state.preferences();

  return {
    preferences,
    async set(prefs: Partial<Preferences>) {
      await app.state.setPreferences(prefs);
      app.state.preferences.invalidateAll();
    },
  };
}
