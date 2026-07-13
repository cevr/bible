import { Context, Effect, Layer, Schema } from 'effect';

import { DbClientService } from '../db-client-service';
import type { DatabaseQueryError } from '../errors';
import type { EgwMarker, EgwNote, MarkerColor, VerseMarker, VerseNote } from './types';

const VerseMarkerRow = Schema.Struct({
  id: Schema.String,
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.Number,
  color: Schema.String,
  created_at: Schema.Number,
});

const VerseNoteRow = Schema.Struct({
  id: Schema.String,
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.Number,
  content: Schema.String,
  created_at: Schema.Number,
});

const EGWNoteRow = Schema.Struct({
  id: Schema.String,
  book_code: Schema.String,
  puborder: Schema.Number,
  content: Schema.String,
  created_at: Schema.Number,
});

const EGWMarkerRow = Schema.Struct({
  id: Schema.String,
  book_code: Schema.String,
  puborder: Schema.Number,
  color: Schema.String,
  created_at: Schema.Number,
});

interface AnnotationServiceShape {
  readonly getChapterMarkers: (
    book: number,
    chapter: number,
  ) => Effect.Effect<Map<number, VerseMarker[]>, DatabaseQueryError>;
  readonly addVerseMarker: (
    book: number,
    chapter: number,
    verse: number,
    color: MarkerColor,
  ) => Effect.Effect<VerseMarker, DatabaseQueryError>;
  readonly removeVerseMarker: (id: string) => Effect.Effect<void, DatabaseQueryError>;
  readonly getVerseNotes: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<VerseNote[], DatabaseQueryError>;
  readonly addVerseNote: (
    book: number,
    chapter: number,
    verse: number,
    content: string,
  ) => Effect.Effect<VerseNote, DatabaseQueryError>;
  readonly removeVerseNote: (id: string) => Effect.Effect<void, DatabaseQueryError>;
  readonly getEgwNotes: (
    bookCode: string,
    puborder: number,
  ) => Effect.Effect<EgwNote[], DatabaseQueryError>;
  readonly addEgwNote: (
    bookCode: string,
    puborder: number,
    content: string,
  ) => Effect.Effect<EgwNote, DatabaseQueryError>;
  readonly removeEgwNote: (id: string) => Effect.Effect<void, DatabaseQueryError>;
  readonly getEgwChapterMarkers: (
    bookCode: string,
    startPuborder: number,
    endPuborder: number,
  ) => Effect.Effect<Map<number, EgwMarker[]>, DatabaseQueryError>;
  readonly addEgwMarker: (
    bookCode: string,
    puborder: number,
    color: MarkerColor,
  ) => Effect.Effect<EgwMarker, DatabaseQueryError>;
  readonly removeEgwMarker: (id: string) => Effect.Effect<void, DatabaseQueryError>;
}

export class AnnotationService extends Context.Service<AnnotationService, AnnotationServiceShape>()(
  '@bible/web/annotations/AnnotationService',
) {
  static layer = Layer.effect(
    AnnotationService,
    Effect.gen(function* () {
      const db = yield* DbClientService;

      const getChapterMarkers = Effect.fn('AnnotationService.getChapterMarkers')(function* (
        book: number,
        chapter: number,
      ) {
        const rows = yield* db.query(
          VerseMarkerRow,
          'state',
          'SELECT id, book, chapter, verse, color, created_at FROM verse_markers WHERE book = ? AND chapter = ? ORDER BY verse, created_at ASC',
          [book, chapter],
        );
        const map = new Map<number, VerseMarker[]>();
        for (const r of rows) {
          let arr = map.get(r.verse);
          if (!arr) {
            arr = [];
            map.set(r.verse, arr);
          }
          arr.push({
            id: r.id,
            book: r.book,
            chapter: r.chapter,
            verse: r.verse,
            color: r.color as MarkerColor,
            createdAt: r.created_at,
          });
        }
        return map;
      });

      const addVerseMarker = Effect.fn('AnnotationService.addVerseMarker')(function* (
        book: number,
        chapter: number,
        verse: number,
        color: MarkerColor,
      ) {
        const id = crypto.randomUUID();
        const createdAt = Date.now();
        yield* db.exec(
          'INSERT OR IGNORE INTO verse_markers (id, book, chapter, verse, color, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [id, book, chapter, verse, color, createdAt],
        );
        return { id, book, chapter, verse, color, createdAt } satisfies VerseMarker;
      });

      const removeVerseMarker = Effect.fn('AnnotationService.removeVerseMarker')(function* (
        id: string,
      ) {
        yield* db.exec('DELETE FROM verse_markers WHERE id = ?', [id]);
      });

      const getVerseNotes = Effect.fn('AnnotationService.getVerseNotes')(function* (
        book: number,
        chapter: number,
        verse: number,
      ) {
        const rows = yield* db.query(
          VerseNoteRow,
          'state',
          'SELECT id, book, chapter, verse, content, created_at FROM verse_notes WHERE book = ? AND chapter = ? AND verse = ? ORDER BY created_at ASC',
          [book, chapter, verse],
        );
        return rows.map(
          (r): VerseNote => ({
            id: r.id,
            book: r.book,
            chapter: r.chapter,
            verse: r.verse,
            content: r.content,
            createdAt: r.created_at,
          }),
        );
      });

      const addVerseNote = Effect.fn('AnnotationService.addVerseNote')(function* (
        book: number,
        chapter: number,
        verse: number,
        content: string,
      ) {
        const id = crypto.randomUUID();
        const createdAt = Date.now();
        yield* db.exec(
          'INSERT INTO verse_notes (id, book, chapter, verse, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [id, book, chapter, verse, content, createdAt],
        );
        return { id, book, chapter, verse, content, createdAt } satisfies VerseNote;
      });

      const removeVerseNote = Effect.fn('AnnotationService.removeVerseNote')(function* (
        id: string,
      ) {
        yield* db.exec('DELETE FROM verse_notes WHERE id = ?', [id]);
      });

      const getEgwNotes = Effect.fn('AnnotationService.getEgwNotes')(function* (
        bookCode: string,
        puborder: number,
      ) {
        const rows = yield* db.query(
          EGWNoteRow,
          'state',
          'SELECT id, book_code, puborder, content, created_at FROM egw_notes WHERE book_code = ? AND puborder = ? ORDER BY created_at DESC',
          [bookCode, puborder],
        );
        return rows.map(
          (r): EgwNote => ({
            id: r.id,
            bookCode: r.book_code,
            puborder: r.puborder,
            content: r.content,
            createdAt: r.created_at,
          }),
        );
      });

      const addEgwNote = Effect.fn('AnnotationService.addEgwNote')(function* (
        bookCode: string,
        puborder: number,
        content: string,
      ) {
        const id = crypto.randomUUID();
        const createdAt = Date.now();
        yield* db.exec(
          'INSERT INTO egw_notes (id, book_code, puborder, content, created_at) VALUES (?, ?, ?, ?, ?)',
          [id, bookCode, puborder, content, createdAt],
        );
        return { id, bookCode, puborder, content, createdAt } satisfies EgwNote;
      });

      const removeEgwNote = Effect.fn('AnnotationService.removeEgwNote')(function* (id: string) {
        yield* db.exec('DELETE FROM egw_notes WHERE id = ?', [id]);
      });

      const getEgwChapterMarkers = Effect.fn('AnnotationService.getEgwChapterMarkers')(function* (
        bookCode: string,
        startPuborder: number,
        endPuborder: number,
      ) {
        const rows = yield* db.query(
          EGWMarkerRow,
          'state',
          'SELECT id, book_code, puborder, color, created_at FROM egw_markers WHERE book_code = ? AND puborder >= ? AND puborder < ? ORDER BY puborder',
          [bookCode, startPuborder, endPuborder],
        );
        const map = new Map<number, EgwMarker[]>();
        for (const r of rows) {
          const marker: EgwMarker = {
            id: r.id,
            bookCode: r.book_code,
            puborder: r.puborder,
            color: r.color as MarkerColor,
            createdAt: r.created_at,
          };
          const existing = map.get(r.puborder);
          if (existing) existing.push(marker);
          else map.set(r.puborder, [marker]);
        }
        return map;
      });

      const addEgwMarker = Effect.fn('AnnotationService.addEgwMarker')(function* (
        bookCode: string,
        puborder: number,
        color: MarkerColor,
      ) {
        const id = crypto.randomUUID();
        const createdAt = Date.now();
        yield* db.exec(
          'INSERT OR IGNORE INTO egw_markers (id, book_code, puborder, color, created_at) VALUES (?, ?, ?, ?, ?)',
          [id, bookCode, puborder, color, createdAt],
        );
        return { id, bookCode, puborder, color, createdAt } satisfies EgwMarker;
      });

      const removeEgwMarker = Effect.fn('AnnotationService.removeEgwMarker')(function* (
        id: string,
      ) {
        yield* db.exec('DELETE FROM egw_markers WHERE id = ?', [id]);
      });

      return AnnotationService.of({
        getChapterMarkers,
        addVerseMarker,
        removeVerseMarker,
        getVerseNotes,
        addVerseNote,
        removeVerseNote,
        getEgwNotes,
        addEgwNote,
        removeEgwNote,
        getEgwChapterMarkers,
        addEgwMarker,
        removeEgwMarker,
      });
    }),
  );
}
