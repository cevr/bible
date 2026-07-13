import { Context, Effect, Layer, Schema } from 'effect';

import { CollectionService } from '../collections/effect-service';
import { DbClientService } from '../db-client-service';
import { AppStateService } from '../state/effect-service';

export class BackupError extends Schema.TaggedErrorClass<BackupError>()('BackupError', {
  cause: Schema.Unknown,
  operation: Schema.Literals(['export', 'decode', 'restore']),
}) {}

const ReferenceArchive = Schema.Struct({
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.optional(Schema.Number),
  verseEnd: Schema.optional(Schema.Number),
});

const BookmarkArchive = Schema.Struct({
  id: Schema.String,
  reference: ReferenceArchive,
  note: Schema.optional(Schema.String),
  createdAt: Schema.Number,
});

const HistoryArchive = Schema.Struct({
  reference: ReferenceArchive,
  visitedAt: Schema.Number,
});

const PreferencesArchive = Schema.Struct({
  theme: Schema.Literals(['light', 'dark', 'system']),
  displayMode: Schema.Literals(['verse', 'paragraph']),
  fontFamily: Schema.String,
  fontSize: Schema.Number,
  lineHeight: Schema.Number,
  letterSpacing: Schema.Number,
});

const VerseNoteArchive = Schema.Struct({
  id: Schema.String,
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.Number,
  content: Schema.String,
  createdAt: Schema.Number,
});

const VerseMarkerArchive = Schema.Struct({
  id: Schema.String,
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.Number,
  color: Schema.Literals(['red', 'orange', 'yellow', 'green', 'blue', 'purple']),
  createdAt: Schema.Number,
});

const StudyCollectionArchive = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  color: Schema.NullOr(Schema.String),
  createdAt: Schema.Number,
});

const CollectionVerseArchive = Schema.Struct({
  collectionId: Schema.String,
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.Number,
  addedAt: Schema.Number,
});

const CollectionArchive = Schema.Struct({
  collection: StudyCollectionArchive,
  verses: Schema.Array(CollectionVerseArchive),
});

export const BackupArchive = Schema.Struct({
  version: Schema.Literal(1),
  exportedAt: Schema.String,
  bookmarks: Schema.Array(BookmarkArchive),
  history: Schema.Array(HistoryArchive),
  preferences: PreferencesArchive,
  notes: Schema.Array(VerseNoteArchive),
  markers: Schema.Array(VerseMarkerArchive),
  collections: Schema.Array(CollectionArchive),
});

export type BackupArchive = typeof BackupArchive.Type;

export interface RestoreSummary {
  readonly bookmarks: number;
  readonly historyEntries: number;
  readonly notes: number;
  readonly markers: number;
  readonly collections: number;
}

const VerseNoteRow = Schema.Struct({
  id: Schema.String,
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.Number,
  content: Schema.String,
  created_at: Schema.Number,
});

const VerseMarkerRow = Schema.Struct({
  id: Schema.String,
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.Number,
  color: Schema.Literals(['red', 'orange', 'yellow', 'green', 'blue', 'purple']),
  created_at: Schema.Number,
});

export const decodeBackupJson = Schema.decodeUnknownEffect(Schema.fromJsonString(BackupArchive));

interface BackupServiceShape {
  readonly exportJson: () => Effect.Effect<string, BackupError>;
  readonly restoreJson: (json: string) => Effect.Effect<RestoreSummary, BackupError>;
}

export class BackupService extends Context.Service<BackupService, BackupServiceShape>()(
  '@bible/web/backup/BackupService',
) {
  static layer = Layer.effect(
    BackupService,
    Effect.gen(function* () {
      const state = yield* AppStateService;
      const collections = yield* CollectionService;
      const db = yield* DbClientService;

      const exportJson = Effect.fn('BackupService.exportJson')(function* () {
        const [bookmarks, history, preferences, studyCollections, notes, markers] =
          yield* Effect.all(
            [
              state.getBookmarks(),
              state.getHistory(10_000),
              state.getPreferences(),
              collections.getCollections(),
              db.query(
                VerseNoteRow,
                'state',
                'SELECT id, book, chapter, verse, content, created_at FROM verse_notes',
              ),
              db.query(
                VerseMarkerRow,
                'state',
                'SELECT id, book, chapter, verse, color, created_at FROM verse_markers',
              ),
            ],
            { concurrency: 'unbounded' },
          );

        const collectionData = yield* Effect.forEach(
          studyCollections,
          (collection) =>
            collections
              .getCollectionVerses(collection.id)
              .pipe(Effect.map((verses) => ({ collection, verses }))),
          { concurrency: 'unbounded' },
        );

        const archive: BackupArchive = {
          version: 1,
          exportedAt: new Date().toISOString(),
          bookmarks,
          history,
          preferences,
          notes: notes.map((note) => ({
            id: note.id,
            book: note.book,
            chapter: note.chapter,
            verse: note.verse,
            content: note.content,
            createdAt: note.created_at,
          })),
          markers: markers.map((marker) => ({
            id: marker.id,
            book: marker.book,
            chapter: marker.chapter,
            verse: marker.verse,
            color: marker.color,
            createdAt: marker.created_at,
          })),
          collections: collectionData,
        };

        return JSON.stringify(archive, null, 2);
      });

      const restoreArchive = Effect.fn('BackupService.restoreArchive')(function* (
        archive: BackupArchive,
      ) {
        yield* db.exec('BEGIN IMMEDIATE');

        const transaction = Effect.gen(function* () {
          yield* db.exec('DELETE FROM collection_verses');
          yield* db.exec('DELETE FROM collections');
          yield* db.exec('DELETE FROM verse_markers');
          yield* db.exec('DELETE FROM verse_notes');
          yield* db.exec('DELETE FROM bookmarks');
          yield* db.exec('DELETE FROM history');

          for (const bookmark of archive.bookmarks) {
            yield* db.exec(
              'INSERT INTO bookmarks (id, book, chapter, verse, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
              [
                bookmark.id,
                bookmark.reference.book,
                bookmark.reference.chapter,
                bookmark.reference.verse ?? null,
                bookmark.note ?? null,
                bookmark.createdAt,
              ],
            );
          }

          for (const entry of archive.history) {
            yield* db.exec(
              'INSERT INTO history (book, chapter, verse, visited_at) VALUES (?, ?, ?, ?)',
              [
                entry.reference.book,
                entry.reference.chapter,
                entry.reference.verse ?? null,
                entry.visitedAt,
              ],
            );
          }

          yield* db.exec(
            'UPDATE preferences SET theme = ?, display_mode = ?, font_family = ?, font_size = ?, line_height = ?, letter_spacing = ? WHERE id = 1',
            [
              archive.preferences.theme,
              archive.preferences.displayMode,
              archive.preferences.fontFamily,
              archive.preferences.fontSize,
              archive.preferences.lineHeight,
              archive.preferences.letterSpacing,
            ],
          );

          for (const note of archive.notes) {
            yield* db.exec(
              'INSERT INTO verse_notes (id, book, chapter, verse, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
              [note.id, note.book, note.chapter, note.verse, note.content, note.createdAt],
            );
          }

          for (const marker of archive.markers) {
            yield* db.exec(
              'INSERT INTO verse_markers (id, book, chapter, verse, color, created_at) VALUES (?, ?, ?, ?, ?, ?)',
              [
                marker.id,
                marker.book,
                marker.chapter,
                marker.verse,
                marker.color,
                marker.createdAt,
              ],
            );
          }

          for (const { collection, verses } of archive.collections) {
            yield* db.exec(
              'INSERT INTO collections (id, name, description, color, created_at) VALUES (?, ?, ?, ?, ?)',
              [
                collection.id,
                collection.name,
                collection.description,
                collection.color,
                collection.createdAt,
              ],
            );
            for (const verse of verses) {
              yield* db.exec(
                'INSERT INTO collection_verses (collection_id, book, chapter, verse, added_at) VALUES (?, ?, ?, ?, ?)',
                [verse.collectionId, verse.book, verse.chapter, verse.verse, verse.addedAt],
              );
            }
          }

          yield* db.exec('COMMIT');

          return {
            bookmarks: archive.bookmarks.length,
            historyEntries: archive.history.length,
            notes: archive.notes.length,
            markers: archive.markers.length,
            collections: archive.collections.length,
          } satisfies RestoreSummary;
        });

        return yield* transaction.pipe(
          Effect.tapError(() => db.exec('ROLLBACK').pipe(Effect.ignore)),
        );
      });

      return BackupService.of({
        exportJson: () =>
          exportJson().pipe(
            Effect.mapError((cause) => new BackupError({ cause, operation: 'export' })),
          ),
        restoreJson: (json) =>
          decodeBackupJson(json).pipe(
            Effect.mapError((cause) => new BackupError({ cause, operation: 'decode' })),
            Effect.flatMap((archive) =>
              restoreArchive(archive).pipe(
                Effect.mapError((cause) => new BackupError({ cause, operation: 'restore' })),
              ),
            ),
          ),
      });
    }),
  );
}
