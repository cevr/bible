/**
 * Export/Import Service
 *
 * Pure formatters for Markdown export + backup/restore via JSON.
 * No Effect service needed — stateless formatters that take deps as args.
 */
import type { Verse } from '@bible/api';
import { formatBibleReference } from '@bible/core/bible-reader';
import type { AppService } from './app-service';
import type { DbClient } from '@/workers/db-client';
import type { Bookmark, HistoryEntry, Preferences } from './state/effect-service';
import type { VerseNote, VerseMarker, StudyCollection, CollectionVerse } from './study/service';

// ---------------------------------------------------------------------------
// Markdown formatters
// ---------------------------------------------------------------------------

export function versesToMarkdown(
  verses: readonly Verse[],
  opts?: { bookName?: string; chapter?: number; includeReference?: boolean },
): string {
  const lines: string[] = [];
  if (opts?.bookName && opts.chapter != null) {
    lines.push(`## ${opts.bookName} ${opts.chapter}\n`);
  }
  for (const v of verses) {
    const ref = opts?.includeReference
      ? `**${formatBibleReference({ book: v.book, chapter: v.chapter, verse: v.verse })}** `
      : `**${v.verse}** `;
    lines.push(`${ref}${v.text}`);
  }
  return lines.join('\n');
}

export function bookmarksToMarkdown(bookmarks: readonly Bookmark[]): string {
  if (bookmarks.length === 0) return 'No bookmarks.';
  const lines = ['# Bookmarks\n'];
  for (const bm of bookmarks) {
    const ref = formatBibleReference(bm.reference);
    const note = bm.note ? ` — ${bm.note}` : '';
    lines.push(`- ${ref}${note}`);
  }
  return lines.join('\n');
}

export function collectionToMarkdown(
  collection: StudyCollection,
  verses: readonly CollectionVerse[],
): string {
  const lines = [`# ${collection.name}\n`];
  if (collection.description) {
    lines.push(`${collection.description}\n`);
  }
  for (const cv of verses) {
    lines.push(
      `- ${formatBibleReference({ book: cv.book, chapter: cv.chapter, verse: cv.verse })}`,
    );
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Backup JSON schema
// ---------------------------------------------------------------------------

interface BackupData {
  version: 1;
  exportedAt: string;
  bookmarks: Bookmark[];
  history: HistoryEntry[];
  preferences: Preferences;
  notes: VerseNote[];
  markers: VerseMarker[];
  collections: Array<{
    collection: StudyCollection;
    verses: CollectionVerse[];
  }>;
}

// ---------------------------------------------------------------------------
// Export all data as JSON backup
// ---------------------------------------------------------------------------

export async function exportAllJsonFull(app: AppService, db: DbClient): Promise<Blob> {
  const [bookmarks, history, preferences, collections] = await Promise.all([
    app.getBookmarks(),
    app.getHistory(10000),
    app.getPreferences(),
    app.getCollections(),
  ]);

  const [noteRows, markerRows] = await Promise.all([
    db.query<{
      id: string;
      book: number;
      chapter: number;
      verse: number;
      content: string;
      created_at: number;
    }>('state', 'SELECT id, book, chapter, verse, content, created_at FROM verse_notes'),
    db.query<{
      id: string;
      book: number;
      chapter: number;
      verse: number;
      color: string;
      created_at: number;
    }>('state', 'SELECT id, book, chapter, verse, color, created_at FROM verse_markers'),
  ]);

  const notes: VerseNote[] = noteRows.map((r) => ({
    id: r.id,
    book: r.book,
    chapter: r.chapter,
    verse: r.verse,
    content: r.content,
    createdAt: r.created_at,
  }));

  const markers: VerseMarker[] = markerRows.map((r) => ({
    id: r.id,
    book: r.book,
    chapter: r.chapter,
    verse: r.verse,
    color: r.color as VerseMarker['color'],
    createdAt: r.created_at,
  }));

  const collectionData: BackupData['collections'] = [];
  const collVersesAll = await Promise.all(
    collections.map((coll) => app.getCollectionVerses(coll.id)),
  );
  for (let i = 0; i < collections.length; i++) {
    const coll = collections[i];
    const verses = collVersesAll[i];
    if (!coll || !verses) continue;
    collectionData.push({ collection: coll, verses });
  }

  const backup: BackupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    bookmarks,
    history,
    preferences,
    notes,
    markers,
    collections: collectionData,
  };

  return new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
}

// ---------------------------------------------------------------------------
// Import from JSON backup
// ---------------------------------------------------------------------------

export async function importFromJson(db: DbClient, blob: Blob): Promise<{ imported: string[] }> {
  const text = await blob.text();
  const raw: unknown = JSON.parse(text);

  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid backup: expected a JSON object');
  }

  const data = raw as BackupData;

  if (data.version !== 1) {
    throw new Error(
      `Unsupported backup version: ${String((raw as { version?: unknown }).version)}`,
    );
  }

  if (
    !Array.isArray(data.bookmarks) ||
    !Array.isArray(data.history) ||
    !Array.isArray(data.notes) ||
    !Array.isArray(data.markers) ||
    !Array.isArray(data.collections)
  ) {
    throw new Error('Invalid backup: missing required data arrays');
  }

  const imported: string[] = [];

  // Clear existing user data and restore from backup
  // Sequential writes to state.db via worker — cannot be parallelized
  /* eslint-disable no-await-in-loop */

  // Bookmarks
  if (data.bookmarks.length > 0) {
    await db.exec('DELETE FROM bookmarks');
    for (const bm of data.bookmarks) {
      await db.exec(
        'INSERT INTO bookmarks (id, book, chapter, verse, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [
          bm.id,
          bm.reference.book,
          bm.reference.chapter,
          bm.reference.verse ?? null,
          bm.note ?? null,
          bm.createdAt,
        ],
      );
    }
    imported.push(`${data.bookmarks.length} bookmarks`);
  }

  // History
  if (data.history.length > 0) {
    await db.exec('DELETE FROM history');
    for (const h of data.history) {
      await db.exec('INSERT INTO history (book, chapter, verse, visited_at) VALUES (?, ?, ?, ?)', [
        h.reference.book,
        h.reference.chapter,
        h.reference.verse ?? null,
        h.visitedAt,
      ]);
    }
    imported.push(`${data.history.length} history entries`);
  }

  // Preferences
  if (data.preferences) {
    await db.exec(
      'UPDATE preferences SET theme = ?, display_mode = ?, font_family = ?, font_size = ?, line_height = ?, letter_spacing = ? WHERE id = 1',
      [
        data.preferences.theme,
        data.preferences.displayMode,
        data.preferences.fontFamily,
        data.preferences.fontSize,
        data.preferences.lineHeight,
        data.preferences.letterSpacing,
      ],
    );
    imported.push('preferences');
  }

  // Verse notes
  if (data.notes.length > 0) {
    await db.exec('DELETE FROM verse_notes');
    for (const n of data.notes) {
      await db.exec(
        'INSERT INTO verse_notes (id, book, chapter, verse, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [n.id, n.book, n.chapter, n.verse, n.content, n.createdAt],
      );
    }
    imported.push(`${data.notes.length} notes`);
  }

  // Verse markers
  if (data.markers.length > 0) {
    await db.exec('DELETE FROM verse_markers');
    for (const m of data.markers) {
      await db.exec(
        'INSERT INTO verse_markers (id, book, chapter, verse, color, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [m.id, m.book, m.chapter, m.verse, m.color, m.createdAt],
      );
    }
    imported.push(`${data.markers.length} markers`);
  }

  // Collections
  if (data.collections.length > 0) {
    await db.exec('DELETE FROM collection_verses');
    await db.exec('DELETE FROM collections');
    for (const { collection, verses } of data.collections) {
      await db.exec(
        'INSERT INTO collections (id, name, description, color, created_at) VALUES (?, ?, ?, ?, ?)',
        [
          collection.id,
          collection.name,
          collection.description,
          collection.color,
          collection.createdAt,
        ],
      );
      for (const cv of verses) {
        await db.exec(
          'INSERT INTO collection_verses (collection_id, book, chapter, verse, added_at) VALUES (?, ?, ?, ?, ?)',
          [cv.collectionId, cv.book, cv.chapter, cv.verse, cv.addedAt],
        );
      }
    }
    imported.push(`${data.collections.length} collections`);
  }

  /* eslint-enable no-await-in-loop */

  return { imported };
}
