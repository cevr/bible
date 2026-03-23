import { Effect, Layer, ServiceMap } from 'effect';
import { DbClientService } from '../db-client-service';
import type { DatabaseQueryError } from '../errors';
import type { Topic, TopicVerse } from './types';

interface TopicRow {
  id: number;
  name: string;
  parent_id: number | null;
  description: string | null;
}

interface TopicVerseRow {
  topic_id: number;
  book: number;
  chapter: number;
  verse_start: number;
  verse_end: number | null;
  note: string | null;
}

interface WebTopicServiceShape {
  readonly searchTopics: (query: string) => Effect.Effect<Topic[], DatabaseQueryError>;
  readonly getTopic: (id: number) => Effect.Effect<Topic | null, DatabaseQueryError>;
  readonly getTopicVerses: (id: number) => Effect.Effect<TopicVerse[], DatabaseQueryError>;
  readonly getVerseTopics: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<Topic[], DatabaseQueryError>;
  readonly getTopicChildren: (parentId: number) => Effect.Effect<Topic[], DatabaseQueryError>;
  readonly getRootTopics: () => Effect.Effect<Topic[], DatabaseQueryError>;
  readonly getTopicsByLetter: (letter: string) => Effect.Effect<Topic[], DatabaseQueryError>;
}

export class WebTopicService extends ServiceMap.Service<WebTopicService, WebTopicServiceShape>()(
  '@bible-web/TopicService',
) {
  static Live = Layer.effect(
    WebTopicService,
    Effect.gen(function* () {
      const db = yield* DbClientService;

      const searchTopics = Effect.fn('WebTopicService.searchTopics')(function* (query: string) {
        const rows = yield* db.query<TopicRow>(
          'topics',
          `SELECT t.id, t.name, t.parent_id, t.description
           FROM topics_fts fts
           JOIN topics t ON t.id = fts.rowid
           WHERE topics_fts MATCH ?
           ORDER BY rank
           LIMIT 50`,
          [query],
        );
        return rows.map(mapTopic);
      });

      const getTopic = Effect.fn('WebTopicService.getTopic')(function* (id: number) {
        const rows = yield* db.query<TopicRow>(
          'topics',
          'SELECT id, name, parent_id, description FROM topics WHERE id = ? LIMIT 1',
          [id],
        );
        return rows.length > 0 ? mapTopic(rows[0]) : null;
      });

      const getTopicVerses = Effect.fn('WebTopicService.getTopicVerses')(function* (id: number) {
        const rows = yield* db.query<TopicVerseRow>(
          'topics',
          `SELECT topic_id, book, chapter, verse_start, verse_end, note
           FROM topic_verses
           WHERE topic_id = ?
           ORDER BY book, chapter, verse_start`,
          [id],
        );
        return rows.map(mapTopicVerse);
      });

      const getVerseTopics = Effect.fn('WebTopicService.getVerseTopics')(function* (
        book: number,
        chapter: number,
        verse: number,
      ) {
        const rows = yield* db.query<TopicRow>(
          'topics',
          `SELECT DISTINCT t.id, t.name, t.parent_id, t.description
           FROM topic_verses tv
           JOIN topics t ON t.id = tv.topic_id
           WHERE tv.book = ? AND tv.chapter = ?
             AND tv.verse_start <= ?
             AND (tv.verse_end IS NULL OR tv.verse_end >= ?)
           ORDER BY t.name`,
          [book, chapter, verse, verse],
        );
        return rows.map(mapTopic);
      });

      const getTopicChildren = Effect.fn('WebTopicService.getTopicChildren')(function* (
        parentId: number,
      ) {
        const rows = yield* db.query<TopicRow>(
          'topics',
          'SELECT id, name, parent_id, description FROM topics WHERE parent_id = ? ORDER BY name',
          [parentId],
        );
        return rows.map(mapTopic);
      });

      const getRootTopics = Effect.fn('WebTopicService.getRootTopics')(function* () {
        const rows = yield* db.query<TopicRow>(
          'topics',
          'SELECT id, name, parent_id, description FROM topics WHERE parent_id IS NULL ORDER BY name',
        );
        return rows.map(mapTopic);
      });

      const getTopicsByLetter = Effect.fn('WebTopicService.getTopicsByLetter')(function* (
        letter: string,
      ) {
        const rows = yield* db.query<TopicRow>(
          'topics',
          `SELECT id, name, parent_id, description
           FROM topics
           WHERE parent_id IS NULL AND name LIKE ?
           ORDER BY name
           LIMIT 200`,
          [`${letter}%`],
        );
        return rows.map(mapTopic);
      });

      return WebTopicService.of({
        searchTopics,
        getTopic,
        getTopicVerses,
        getVerseTopics,
        getTopicChildren,
        getRootTopics,
        getTopicsByLetter,
      });
    }),
  );
}

function mapTopic(r: TopicRow): Topic {
  return {
    id: r.id,
    name: r.name,
    parentId: r.parent_id,
    description: r.description,
  };
}

function mapTopicVerse(r: TopicVerseRow): TopicVerse {
  return {
    topicId: r.topic_id,
    book: r.book,
    chapter: r.chapter,
    verseStart: r.verse_start,
    verseEnd: r.verse_end,
    note: r.note,
  };
}
