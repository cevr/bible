import { Effect, Layer, ServiceMap } from 'effect';
import { DbClientService } from '../db-client-service';
import type { DatabaseQueryError } from '../errors';
import type { MemoryVerse, PracticeRecord } from './types';

interface MemoryVerseRow {
  id: string;
  book: number;
  chapter: number;
  verse_start: number;
  verse_end: number | null;
  created_at: number;
}

interface PracticeRow {
  id: number;
  verse_id: string;
  mode: string;
  score: number | null;
  practiced_at: number;
}

interface WebMemoryVerseServiceShape {
  readonly getMemoryVerses: () => Effect.Effect<MemoryVerse[], DatabaseQueryError>;
  readonly addMemoryVerse: (
    book: number,
    chapter: number,
    verseStart: number,
    verseEnd?: number,
  ) => Effect.Effect<MemoryVerse, DatabaseQueryError>;
  readonly removeMemoryVerse: (id: string) => Effect.Effect<void, DatabaseQueryError>;
  readonly recordPractice: (
    verseId: string,
    mode: 'reveal' | 'type',
    score: number,
  ) => Effect.Effect<void, DatabaseQueryError>;
  readonly getPracticeHistory: (
    verseId: string,
    limit?: number,
  ) => Effect.Effect<PracticeRecord[], DatabaseQueryError>;
}

export class WebMemoryVerseService extends ServiceMap.Service<
  WebMemoryVerseService,
  WebMemoryVerseServiceShape
>()('@bible-web/MemoryVerseService') {
  static Live = Layer.effect(
    WebMemoryVerseService,
    Effect.gen(function* () {
      const db = yield* DbClientService;

      const getMemoryVerses = Effect.fn('WebMemoryVerseService.getMemoryVerses')(function* () {
        const rows = yield* db.query<MemoryVerseRow>(
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
        const rows = yield* db.query<PracticeRow>(
          'state',
          'SELECT id, verse_id, mode, score, practiced_at FROM memory_practice WHERE verse_id = ? ORDER BY practiced_at DESC LIMIT ?',
          [verseId, limit],
        );
        return rows.map(mapPractice);
      });

      return WebMemoryVerseService.of({
        getMemoryVerses,
        addMemoryVerse,
        removeMemoryVerse,
        recordPractice,
        getPracticeHistory,
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
