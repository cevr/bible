import { Context, Effect, Layer, Schema } from 'effect';

import { DbClientService, type DatabaseQueryError } from '../db-client-service';
import type { CollectionVerse, StudyCollection } from './types';

export class CollectionDataError extends Schema.TaggedErrorClass<CollectionDataError>()(
  'CollectionDataError',
  {
    cause: Schema.Unknown,
    operation: Schema.String,
  },
) {}

const CollectionRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  color: Schema.NullOr(Schema.String),
  created_at: Schema.Number,
});

const CollectionVerseRow = Schema.Struct({
  collection_id: Schema.String,
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.Number,
  added_at: Schema.Number,
});

interface CollectionServiceShape {
  readonly getCollections: () => Effect.Effect<StudyCollection[], CollectionDataError>;
  readonly createCollection: (
    name: string,
    opts?: { description?: string; color?: string },
  ) => Effect.Effect<StudyCollection, CollectionDataError>;
  readonly removeCollection: (id: string) => Effect.Effect<void, CollectionDataError>;
  readonly getVerseCollections: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<StudyCollection[], CollectionDataError>;
  readonly addVerseToCollection: (
    collectionId: string,
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<void, CollectionDataError>;
  readonly removeVerseFromCollection: (
    collectionId: string,
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<void, CollectionDataError>;
  readonly getCollectionVerses: (
    collectionId: string,
  ) => Effect.Effect<CollectionVerse[], CollectionDataError>;
  readonly getEgwParagraphCollections: (
    bookCode: string,
    puborder: number,
  ) => Effect.Effect<StudyCollection[], CollectionDataError>;
  readonly addEgwToCollection: (
    collectionId: string,
    bookCode: string,
    puborder: number,
  ) => Effect.Effect<void, CollectionDataError>;
  readonly removeEgwFromCollection: (
    collectionId: string,
    bookCode: string,
    puborder: number,
  ) => Effect.Effect<void, CollectionDataError>;
}

export class CollectionService extends Context.Service<CollectionService, CollectionServiceShape>()(
  '@bible/web/collections/CollectionService',
) {
  static layer = Layer.effect(
    CollectionService,
    Effect.gen(function* () {
      const db = yield* DbClientService;

      const getCollections = Effect.fn('CollectionService.getCollections')(function* () {
        const rows = yield* db.query(
          CollectionRow,
          'state',
          'SELECT id, name, description, color, created_at FROM collections ORDER BY created_at DESC',
        );
        return rows.map(
          (r): StudyCollection => ({
            id: r.id,
            name: r.name,
            description: r.description,
            color: r.color,
            createdAt: r.created_at,
          }),
        );
      });

      const createCollection = Effect.fn('CollectionService.createCollection')(function* (
        name: string,
        opts?: { description?: string; color?: string },
      ) {
        const id = crypto.randomUUID();
        const createdAt = Date.now();
        yield* db.exec(
          'INSERT INTO collections (id, name, description, color, created_at) VALUES (?, ?, ?, ?, ?)',
          [id, name, opts?.description ?? null, opts?.color ?? null, createdAt],
        );
        return {
          id,
          name,
          description: opts?.description ?? null,
          color: opts?.color ?? null,
          createdAt,
        } satisfies StudyCollection;
      });

      const removeCollection = Effect.fn('CollectionService.removeCollection')(function* (
        id: string,
      ) {
        yield* db.exec('DELETE FROM collections WHERE id = ?', [id]);
      });

      const getVerseCollections = Effect.fn('CollectionService.getVerseCollections')(function* (
        book: number,
        chapter: number,
        verse: number,
      ) {
        const rows = yield* db.query(
          CollectionRow,
          'state',
          `SELECT c.id, c.name, c.description, c.color, c.created_at
           FROM collections c
           JOIN collection_verses cv ON c.id = cv.collection_id
           WHERE cv.book = ? AND cv.chapter = ? AND cv.verse = ?
           ORDER BY c.name`,
          [book, chapter, verse],
        );
        return rows.map(
          (r): StudyCollection => ({
            id: r.id,
            name: r.name,
            description: r.description,
            color: r.color,
            createdAt: r.created_at,
          }),
        );
      });

      const addVerseToCollection = Effect.fn('CollectionService.addVerseToCollection')(function* (
        collectionId: string,
        book: number,
        chapter: number,
        verse: number,
      ) {
        yield* db.exec(
          'INSERT OR IGNORE INTO collection_verses (collection_id, book, chapter, verse, added_at) VALUES (?, ?, ?, ?, ?)',
          [collectionId, book, chapter, verse, Date.now()],
        );
      });

      const removeVerseFromCollection = Effect.fn('CollectionService.removeVerseFromCollection')(
        function* (collectionId: string, book: number, chapter: number, verse: number) {
          yield* db.exec(
            'DELETE FROM collection_verses WHERE collection_id = ? AND book = ? AND chapter = ? AND verse = ?',
            [collectionId, book, chapter, verse],
          );
        },
      );

      const getCollectionVerses = Effect.fn('CollectionService.getCollectionVerses')(function* (
        collectionId: string,
      ) {
        const rows = yield* db.query(
          CollectionVerseRow,
          'state',
          'SELECT collection_id, book, chapter, verse, added_at FROM collection_verses WHERE collection_id = ? ORDER BY added_at DESC',
          [collectionId],
        );
        return rows.map(
          (r): CollectionVerse => ({
            collectionId: r.collection_id,
            book: r.book,
            chapter: r.chapter,
            verse: r.verse,
            addedAt: r.added_at,
          }),
        );
      });

      const getEgwParagraphCollections = Effect.fn('CollectionService.getEgwParagraphCollections')(
        function* (bookCode: string, puborder: number) {
          const rows = yield* db.query(
            CollectionRow,
            'state',
            `SELECT c.id, c.name, c.description, c.color, c.created_at
           FROM collections c
           JOIN egw_collection_items eci ON eci.collection_id = c.id
           WHERE eci.book_code = ? AND eci.puborder = ?
           ORDER BY c.name`,
            [bookCode, puborder],
          );
          return rows.map(
            (r): StudyCollection => ({
              id: r.id,
              name: r.name,
              description: r.description,
              color: r.color,
              createdAt: r.created_at,
            }),
          );
        },
      );

      const addEgwToCollection = Effect.fn('CollectionService.addEgwToCollection')(function* (
        collectionId: string,
        bookCode: string,
        puborder: number,
      ) {
        yield* db.exec(
          'INSERT OR IGNORE INTO egw_collection_items (collection_id, book_code, puborder, added_at) VALUES (?, ?, ?, ?)',
          [collectionId, bookCode, puborder, Date.now()],
        );
      });

      const removeEgwFromCollection = Effect.fn('CollectionService.removeEgwFromCollection')(
        function* (collectionId: string, bookCode: string, puborder: number) {
          yield* db.exec(
            'DELETE FROM egw_collection_items WHERE collection_id = ? AND book_code = ? AND puborder = ?',
            [collectionId, bookCode, puborder],
          );
        },
      );

      const mapDataError = <A>(operation: string, effect: Effect.Effect<A, DatabaseQueryError>) =>
        effect.pipe(Effect.mapError((cause) => new CollectionDataError({ cause, operation })));

      return CollectionService.of({
        getCollections: () => mapDataError('getCollections', getCollections()),
        createCollection: (name, options) =>
          mapDataError('createCollection', createCollection(name, options)),
        removeCollection: (id) => mapDataError('removeCollection', removeCollection(id)),
        getVerseCollections: (book, chapter, verse) =>
          mapDataError('getVerseCollections', getVerseCollections(book, chapter, verse)),
        addVerseToCollection: (collectionId, book, chapter, verse) =>
          mapDataError(
            'addVerseToCollection',
            addVerseToCollection(collectionId, book, chapter, verse),
          ),
        removeVerseFromCollection: (collectionId, book, chapter, verse) =>
          mapDataError(
            'removeVerseFromCollection',
            removeVerseFromCollection(collectionId, book, chapter, verse),
          ),
        getCollectionVerses: (collectionId) =>
          mapDataError('getCollectionVerses', getCollectionVerses(collectionId)),
        getEgwParagraphCollections: (bookCode, puborder) =>
          mapDataError(
            'getEgwParagraphCollections',
            getEgwParagraphCollections(bookCode, puborder),
          ),
        addEgwToCollection: (collectionId, bookCode, puborder) =>
          mapDataError('addEgwToCollection', addEgwToCollection(collectionId, bookCode, puborder)),
        removeEgwFromCollection: (collectionId, bookCode, puborder) =>
          mapDataError(
            'removeEgwFromCollection',
            removeEgwFromCollection(collectionId, bookCode, puborder),
          ),
      });
    }),
  );
}
