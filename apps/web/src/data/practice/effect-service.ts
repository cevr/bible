import { Effect, Layer, Context, Schema } from 'effect';
import { DbClientService, type DatabaseQueryError } from '../db-client-service';
import type { MemoryVerse, PracticeRecord } from './types';

export class PracticeDataError extends Schema.TaggedErrorClass<PracticeDataError>()(
  'PracticeDataError',
  {
    cause: Schema.Unknown,
    operation: Schema.String,
  },
) {}

const MemoryVerseRow = Schema.Struct({
  id: Schema.String,
  book: Schema.Number,
  chapter: Schema.Number,
  verse_start: Schema.Number,
  verse_end: Schema.NullOr(Schema.Number),
  created_at: Schema.Number,
});
type MemoryVerseRow = typeof MemoryVerseRow.Type;

const PracticeRow = Schema.Struct({
  id: Schema.Number,
  verse_id: Schema.String,
  mode: Schema.String,
  score: Schema.NullOr(Schema.Number),
  practiced_at: Schema.Number,
});
type PracticeRow = typeof PracticeRow.Type;

interface WebMemoryVerseServiceShape {
  readonly getMemoryVerses: () => Effect.Effect<MemoryVerse[], PracticeDataError>;
  readonly addMemoryVerse: (
    book: number,
    chapter: number,
    verseStart: number,
    verseEnd?: number,
  ) => Effect.Effect<MemoryVerse, PracticeDataError>;
  readonly removeMemoryVerse: (id: string) => Effect.Effect<void, PracticeDataError>;
  readonly recordPractice: (
    verseId: string,
    mode: 'reveal' | 'type',
    score: number,
  ) => Effect.Effect<void, PracticeDataError>;
  readonly getPracticeHistory: (
    verseId: string,
    limit?: number,
  ) => Effect.Effect<PracticeRecord[], PracticeDataError>;
}

export class WebMemoryVerseService extends Context.Service<
  WebMemoryVerseService,
  WebMemoryVerseServiceShape
>()('@bible-web/MemoryVerseService') {
  static Live = Layer.effect(
    WebMemoryVerseService,
    Effect.gen(function* () {
      const db = yield* DbClientService;

      const getMemoryVerses = Effect.fn('WebMemoryVerseService.getMemoryVerses')(function* () {
        const rows = yield* db.query(
          MemoryVerseRow,
          'state',
          'SELECT id, book, chapter, verse_start, verse_end, created_at FROM memory_verses ORDER BY created_at DESC',
        );
        return rows.map(mapVerse);
      });

      const addMemoryVerse = Effect.fn('WebMemoryVerseService.addMemoryVerse')(function* (
        book: number,
        chapter: number,
        verseStart: number,
        verseEnd?: number,
      ) {
        const id = crypto.randomUUID();
        const createdAt = Date.now();
        yield* db.exec(
          'INSERT OR IGNORE INTO memory_verses (id, book, chapter, verse_start, verse_end, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [id, book, chapter, verseStart, verseEnd ?? null, createdAt],
        );
        return {
          id,
          book,
          chapter,
          verseStart,
          verseEnd: verseEnd ?? null,
          createdAt,
        } satisfies MemoryVerse;
      });

      const removeMemoryVerse = Effect.fn('WebMemoryVerseService.removeMemoryVerse')(function* (
        id: string,
      ) {
        // CASCADE deletes memory_practice rows
        yield* db.exec('DELETE FROM memory_verses WHERE id = ?', [id]);
      });

      const recordPractice = Effect.fn('WebMemoryVerseService.recordPractice')(function* (
        verseId: string,
        mode: 'reveal' | 'type',
        score: number,
      ) {
        yield* db.exec(
          'INSERT INTO memory_practice (verse_id, mode, score, practiced_at) VALUES (?, ?, ?, ?)',
          [verseId, mode, score, Date.now()],
        );
      });

      const getPracticeHistory = Effect.fn('WebMemoryVerseService.getPracticeHistory')(function* (
        verseId: string,
        limit = 20,
      ) {
        const rows = yield* db.query(
          PracticeRow,
          'state',
          'SELECT id, verse_id, mode, score, practiced_at FROM memory_practice WHERE verse_id = ? ORDER BY practiced_at DESC LIMIT ?',
          [verseId, limit],
        );
        return rows.map(mapPractice);
      });

      const mapDataError = <A>(operation: string, effect: Effect.Effect<A, DatabaseQueryError>) =>
        effect.pipe(Effect.mapError((cause) => new PracticeDataError({ cause, operation })));

      return WebMemoryVerseService.of({
        getMemoryVerses: () => mapDataError('getMemoryVerses', getMemoryVerses()),
        addMemoryVerse: (book, chapter, verseStart, verseEnd) =>
          mapDataError('addMemoryVerse', addMemoryVerse(book, chapter, verseStart, verseEnd)),
        removeMemoryVerse: (id) => mapDataError('removeMemoryVerse', removeMemoryVerse(id)),
        recordPractice: (verseId, mode, score) =>
          mapDataError('recordPractice', recordPractice(verseId, mode, score)),
        getPracticeHistory: (verseId, limit) =>
          mapDataError('getPracticeHistory', getPracticeHistory(verseId, limit)),
      });
    }),
  );
}

function mapVerse(r: MemoryVerseRow): MemoryVerse {
  return {
    id: r.id,
    book: r.book,
    chapter: r.chapter,
    verseStart: r.verse_start,
    verseEnd: r.verse_end,
    createdAt: r.created_at,
  };
}

function mapPractice(r: PracticeRow): PracticeRecord {
  return {
    id: r.id,
    verseId: r.verse_id,
    mode: r.mode as 'reveal' | 'type',
    score: r.score,
    practicedAt: r.practiced_at,
  };
}
