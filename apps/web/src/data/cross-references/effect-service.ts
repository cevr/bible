import { Context, Effect, Layer, Schema } from 'effect';

import { DbClientService } from '../db-client-service';
import type { DatabaseQueryError } from '../errors';
import type { ClassifiedCrossReference, CrossRefType, UserCrossRef } from './types';

const CrossRefRow = Schema.Struct({
  ref_book: Schema.Number,
  ref_chapter: Schema.Number,
  ref_verse: Schema.NullOr(Schema.Number),
  ref_verse_end: Schema.NullOr(Schema.Number),
  source: Schema.String,
  preview_text: Schema.NullOr(Schema.String),
});

const ClassificationRow = Schema.Struct({
  ref_book: Schema.Number,
  ref_chapter: Schema.Number,
  ref_verse: Schema.NullOr(Schema.Number),
  type: Schema.String,
  confidence: Schema.NullOr(Schema.Number),
});
type ClassificationRow = typeof ClassificationRow.Type;

const UserCrossRefRow = Schema.Struct({
  id: Schema.String,
  ref_book: Schema.Number,
  ref_chapter: Schema.Number,
  ref_verse: Schema.NullOr(Schema.Number),
  ref_verse_end: Schema.NullOr(Schema.Number),
  type: Schema.NullOr(Schema.String),
  note: Schema.NullOr(Schema.String),
  created_at: Schema.Number,
});

function classificationKey(book: number, chapter: number, verse: number | null): string {
  return `${book}:${chapter}:${verse ?? 0}`;
}

interface CrossReferenceServiceShape {
  readonly getCrossRefs: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<ClassifiedCrossReference[], DatabaseQueryError>;
  readonly setRefType: (
    source: { book: number; chapter: number; verse: number },
    target: { book: number; chapter: number; verse: number | null },
    type: CrossRefType,
  ) => Effect.Effect<void, DatabaseQueryError>;
  readonly addUserCrossRef: (
    source: { book: number; chapter: number; verse: number },
    target: { book: number; chapter: number; verse?: number; verseEnd?: number },
    opts?: { type?: CrossRefType; note?: string },
  ) => Effect.Effect<UserCrossRef, DatabaseQueryError>;
  readonly removeUserCrossRef: (id: string) => Effect.Effect<void, DatabaseQueryError>;
}

export class CrossReferenceService extends Context.Service<
  CrossReferenceService,
  CrossReferenceServiceShape
>()('@bible/web/cross-references/CrossReferenceService') {
  static layer = Layer.effect(
    CrossReferenceService,
    Effect.gen(function* () {
      const db = yield* DbClientService;

      const getCrossRefs = Effect.fn('CrossReferenceService.getCrossRefs')(function* (
        book: number,
        chapter: number,
        verse: number,
      ) {
        const [rawRefs, classifications, userRefs] = yield* Effect.all(
          [
            db.query(
              CrossRefRow,
              'bible',
              `SELECT ref_book, ref_chapter, ref_verse, ref_verse_end, source, preview_text
               FROM cross_refs
               WHERE book = ? AND chapter = ? AND verse = ?`,
              [book, chapter, verse],
            ),
            db.query(
              ClassificationRow,
              'state',
              `SELECT ref_book, ref_chapter, ref_verse, type, confidence
               FROM cross_ref_classifications
               WHERE source_book = ? AND source_chapter = ? AND source_verse = ?`,
              [book, chapter, verse],
            ),
            db.query(
              UserCrossRefRow,
              'state',
              `SELECT id, ref_book, ref_chapter, ref_verse, ref_verse_end, type, note, created_at
               FROM user_cross_refs
               WHERE source_book = ? AND source_chapter = ? AND source_verse = ?`,
              [book, chapter, verse],
            ),
          ],
          { concurrency: 'unbounded' },
        );

        const classMap = new Map<string, ClassificationRow>();
        for (const classification of classifications) {
          classMap.set(
            classificationKey(
              classification.ref_book,
              classification.ref_chapter,
              classification.ref_verse,
            ),
            classification,
          );
        }

        const enriched: ClassifiedCrossReference[] = rawRefs.map((reference) => {
          const classification = classMap.get(
            classificationKey(reference.ref_book, reference.ref_chapter, reference.ref_verse),
          );
          return {
            book: reference.ref_book,
            chapter: reference.ref_chapter,
            verse: reference.ref_verse,
            verseEnd: reference.ref_verse_end,
            source: reference.source as 'openbible' | 'tske',
            previewText: reference.preview_text,
            classification: (classification?.type as CrossRefType) ?? null,
            confidence: classification?.confidence ?? null,
          };
        });

        for (const reference of userRefs) {
          enriched.push({
            book: reference.ref_book,
            chapter: reference.ref_chapter,
            verse: reference.ref_verse,
            verseEnd: reference.ref_verse_end,
            source: 'user',
            previewText: null,
            classification: (reference.type as CrossRefType) ?? null,
            confidence: null,
            userRefId: reference.id,
            userNote: reference.note,
          });
        }

        return enriched;
      });

      const setRefType = Effect.fn('CrossReferenceService.setRefType')(function* (
        source: { book: number; chapter: number; verse: number },
        target: { book: number; chapter: number; verse: number | null },
        type: CrossRefType,
      ) {
        yield* db.exec(
          `INSERT INTO cross_ref_classifications
             (source_book, source_chapter, source_verse, ref_book, ref_chapter, ref_verse, type, confidence, classified_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)
           ON CONFLICT(source_book, source_chapter, source_verse, ref_book, ref_chapter, ref_verse)
           DO UPDATE SET type = excluded.type, classified_at = excluded.classified_at`,
          [
            source.book,
            source.chapter,
            source.verse,
            target.book,
            target.chapter,
            target.verse ?? 0,
            type,
            Date.now(),
          ],
        );
      });

      const addUserCrossRef = Effect.fn('CrossReferenceService.addUserCrossRef')(function* (
        source: { book: number; chapter: number; verse: number },
        target: { book: number; chapter: number; verse?: number; verseEnd?: number },
        opts?: { type?: CrossRefType; note?: string },
      ) {
        const id = crypto.randomUUID();
        const createdAt = Date.now();
        yield* db.exec(
          `INSERT INTO user_cross_refs
             (id, source_book, source_chapter, source_verse, ref_book, ref_chapter, ref_verse, ref_verse_end, type, note, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            source.book,
            source.chapter,
            source.verse,
            target.book,
            target.chapter,
            target.verse ?? null,
            target.verseEnd ?? null,
            opts?.type ?? null,
            opts?.note ?? null,
            createdAt,
          ],
        );
        return {
          id,
          refBook: target.book,
          refChapter: target.chapter,
          refVerse: target.verse ?? null,
          refVerseEnd: target.verseEnd ?? null,
          type: opts?.type ?? null,
          note: opts?.note ?? null,
          createdAt,
        } satisfies UserCrossRef;
      });

      const removeUserCrossRef = Effect.fn('CrossReferenceService.removeUserCrossRef')(
        (id: string) => db.exec('DELETE FROM user_cross_refs WHERE id = ?', [id]),
      );

      return CrossReferenceService.of({
        getCrossRefs,
        setRefType,
        addUserCrossRef,
        removeUserCrossRef,
      });
    }),
  );
}
