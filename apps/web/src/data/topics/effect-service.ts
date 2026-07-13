import { Effect, Layer, Context, Schema } from 'effect';
import { DbClientService, type DatabaseQueryError } from '../db-client-service';
import type { Topic, TopicVerse } from './types';

export class TopicDataError extends Schema.TaggedErrorClass<TopicDataError>()('TopicDataError', {
  cause: Schema.Unknown,
  operation: Schema.String,
}) {}

const TopicRow = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  parent_id: Schema.NullOr(Schema.Number),
  description: Schema.NullOr(Schema.String),
});
type TopicRow = typeof TopicRow.Type;

const TopicVerseRow = Schema.Struct({
  topic_id: Schema.Number,
  book: Schema.Number,
  chapter: Schema.Number,
  verse_start: Schema.Number,
  verse_end: Schema.NullOr(Schema.Number),
  note: Schema.NullOr(Schema.String),
});
type TopicVerseRow = typeof TopicVerseRow.Type;

interface WebTopicServiceShape {
  readonly searchTopics: (query: string) => Effect.Effect<Topic[], TopicDataError>;
  readonly getTopic: (id: number) => Effect.Effect<Topic | null, TopicDataError>;
  readonly getTopicVerses: (id: number) => Effect.Effect<TopicVerse[], TopicDataError>;
  readonly getVerseTopics: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<Topic[], TopicDataError>;
  readonly getTopicChildren: (parentId: number) => Effect.Effect<Topic[], TopicDataError>;
  readonly getRootTopics: () => Effect.Effect<Topic[], TopicDataError>;
  readonly getTopicsByLetter: (letter: string) => Effect.Effect<Topic[], TopicDataError>;
}

export class WebTopicService extends Context.Service<WebTopicService, WebTopicServiceShape>()(
  '@bible-web/TopicService',
) {
  static Live = Layer.effect(
    WebTopicService,
    Effect.gen(function* () {
      const db = yield* DbClientService;

      const searchTopics = Effect.fn('WebTopicService.searchTopics')(function* (query: string) {
        const rows = yield* db.query(
          TopicRow,
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
        const rows = yield* db.query(
          TopicRow,
          'topics',
          'SELECT id, name, parent_id, description FROM topics WHERE id = ? LIMIT 1',
          [id],
        );
        const firstRow = rows[0];
        return firstRow ? mapTopic(firstRow) : null;
      });

      const getTopicVerses = Effect.fn('WebTopicService.getTopicVerses')(function* (id: number) {
        const rows = yield* db.query(
          TopicVerseRow,
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
        const rows = yield* db.query(
          TopicRow,
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
        const rows = yield* db.query(
          TopicRow,
          'topics',
          'SELECT id, name, parent_id, description FROM topics WHERE parent_id = ? ORDER BY name',
          [parentId],
        );
        return rows.map(mapTopic);
      });

      const getRootTopics = Effect.fn('WebTopicService.getRootTopics')(function* () {
        const rows = yield* db.query(
          TopicRow,
          'topics',
          'SELECT id, name, parent_id, description FROM topics WHERE parent_id IS NULL ORDER BY name',
        );
        return rows.map(mapTopic);
      });

      const getTopicsByLetter = Effect.fn('WebTopicService.getTopicsByLetter')(function* (
        letter: string,
      ) {
        const rows = yield* db.query(
          TopicRow,
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

      const mapDataError = <A>(operation: string, effect: Effect.Effect<A, DatabaseQueryError>) =>
        effect.pipe(Effect.mapError((cause) => new TopicDataError({ cause, operation })));

      return WebTopicService.of({
        searchTopics: (query) => mapDataError('searchTopics', searchTopics(query)),
        getTopic: (id) => mapDataError('getTopic', getTopic(id)),
        getTopicVerses: (id) => mapDataError('getTopicVerses', getTopicVerses(id)),
        getVerseTopics: (book, chapter, verse) =>
          mapDataError('getVerseTopics', getVerseTopics(book, chapter, verse)),
        getTopicChildren: (parentId) =>
          mapDataError('getTopicChildren', getTopicChildren(parentId)),
        getRootTopics: () => mapDataError('getRootTopics', getRootTopics()),
        getTopicsByLetter: (letter) => mapDataError('getTopicsByLetter', getTopicsByLetter(letter)),
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
