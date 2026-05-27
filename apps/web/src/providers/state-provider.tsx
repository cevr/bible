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
  const position = app.position();

  return {
    position,
    async set(pos: Position) {
      await app.setPosition(pos);
      app.position.invalidateAll();
    },
  };
}

export function useBookmarks() {
  const app = useApp();
  const bookmarks = app.bookmarks();

  return {
    bookmarks,
    async add(ref: Reference, note?: string) {
      const bm = await app.addBookmark(ref, note);
      app.bookmarks.invalidateAll();
      return bm;
    },
    async remove(id: string) {
      await app.removeBookmark(id);
      app.bookmarks.invalidateAll();
    },
  };
}

export function useHistory() {
  const app = useApp();
  const history = app.history();

  return {
    history,
    async add(ref: Reference) {
      await app.addToHistory(ref);
      app.history.invalidateAll();
    },
    async clear() {
      await app.clearHistory();
      app.history.invalidateAll();
    },
  };
}

export function usePreferences() {
  const app = useApp();
  const preferences = app.preferences();

  return {
    preferences,
    async set(prefs: Partial<Preferences>) {
      await app.setPreferences(prefs);
      app.preferences.invalidateAll();
    },
  };
}
