import { describe, expect, it } from 'effect-bun-test';
import { BIBLE_BOOKS } from '../bible/canon.js';
import { Chapter, Reference as BibleReference, SearchHit, Verse } from '../bible/model.js';
import { BibleService } from '../bible/service.js';
import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import {
  DEFAULT_READING_PREFERENCES,
  applyReadingPreferencesPatch,
} from '../reading-preferences/model.js';
import { WritingsService } from '../writings/service.js';
import {
  publicationCode,
  publicationId,
  WritingsDownloadResult,
  WritingsLibraryPublication,
} from '../writings/model.js';
import { TopicDetail, TopicId, TopicReference, TopicSection } from '../topics/model.js';
import { TopicService } from '../topics/service.js';
import { Effect, Layer, Option, Schema, Stream } from 'effect';
import type { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { RpcTest } from 'effect/unstable/rpc';

import { BibleProcedureGroup } from './group.js';
import { BibleProcedureHandlers } from './handlers.js';
import {
  CommitId,
  CURRENT_PROTOCOL_VERSION,
  CURRENT_RUNTIME_SCHEMA_VERSION,
  RuntimeConnection,
  RuntimeEventSequence,
  RuntimeGeneration,
} from './model.js';
import {
  DataPortabilityRuntime,
  LibraryStateRuntime,
  ProcedureRuntime,
  ReadingContinuityRuntime,
  ReadingPreferencesRuntime,
  WritingsLibraryRuntime,
} from './services.js';

const genesis = BIBLE_BOOKS[0]!;
const chapter = new Chapter({
  book: genesis,
  reference: BibleReference.chapter(1, 1),
  verses: [
    new Verse({
      reference: BibleReference.verse(1, 1, 1),
      text: 'In the beginning God created the heaven and the earth.',
    }),
  ],
  previous: Option.none(),
  next: Option.some(BibleReference.chapter(1, 2)),
});

const resurrectionTopic = new TopicDetail({
  id: Schema.decodeSync(TopicId)('naves-topical-bible.resurrection'),
  name: 'RESURRECTION',
  alternativeNames: [],
  sections: [
    new TopicSection({
      label: 'General references',
      references: [new TopicReference({ raw: 'John 11:25', osis: ['John.11.25'] })],
    }),
  ],
});

const remotePublication = new WritingsLibraryPublication({
  id: publicationId(127),
  code: publicationCode('PP'),
  title: 'Patriarchs and Prophets',
  author: 'Ellen G. White',
  paragraphCount: 0,
  source: 'remote',
  status: 'pending',
  error: null,
});

const Dependencies = Layer.mergeAll(
  BibleService.Test({
    books: [genesis],
    chapters: new Map([['1:1', chapter]]),
    searchHits: [
      new SearchHit({
        book: genesis,
        verse: chapter.verses[0],
      }),
    ],
  }),
  WritingsService.Live.pipe(
    Layer.provide(EGWParagraphDatabase.Test({ books: [], paragraphs: [] })),
  ),
  TopicService.Test([resurrectionTopic]),
  Layer.succeed(
    WritingsLibraryRuntime,
    WritingsLibraryRuntime.of({
      get: Effect.succeed([remotePublication]),
      download: (id) =>
        Effect.succeed(
          new WritingsDownloadResult({
            publicationId: id,
            code: remotePublication.code,
            status: 'success',
            paragraphCount: 42,
            error: null,
          }),
        ),
      downloadAll: Effect.succeed([]),
    }),
  ),
  Layer.succeed(
    ProcedureRuntime,
    ProcedureRuntime.of({
      connect: () =>
        Effect.succeed(
          new RuntimeConnection({
            protocolVersion: CURRENT_PROTOCOL_VERSION,
            schemaVersion: CURRENT_RUNTIME_SCHEMA_VERSION,
            generation: Schema.decodeSync(RuntimeGeneration)('test-runtime'),
            capabilities: [],
          }),
        ),
      events: () => Stream.empty,
    }),
  ),
  Layer.succeed(
    ReadingContinuityRuntime,
    ReadingContinuityRuntime.of({
      get: Effect.succeed({ source: 'bible', resourceId: 'KJV', location: '/bible/43/3/16' }),
      record: () =>
        Effect.succeed({
          _tag: 'MutationCommit',
          value: {},
          commitId: Schema.decodeSync(CommitId)('test-continuity-commit'),
          changes: { scopes: [{ _tag: 'ReadingContinuity' }] },
        }),
    }),
  ),
  Layer.succeed(
    ReadingPreferencesRuntime,
    ReadingPreferencesRuntime.of({
      get: Effect.succeed(DEFAULT_READING_PREFERENCES),
      patch: (patch) =>
        Effect.succeed({
          _tag: 'MutationCommit',
          value: applyReadingPreferencesPatch(DEFAULT_READING_PREFERENCES, patch),
          commitId: Schema.decodeSync(CommitId)('test-commit'),
          changes: { scopes: [] },
        }),
    }),
  ),
  Layer.succeed(
    LibraryStateRuntime,
    LibraryStateRuntime.of({
      annotations: () =>
        Effect.succeed({ bookmarks: [], notes: [], markers: [], crossReferences: [] }),
      collections: Effect.succeed([]),
      readingPlans: Effect.succeed([]),
      memoryPractice: Effect.succeed({ verses: [], history: [] }),
      mutate: () =>
        Effect.succeed({
          _tag: 'MutationCommit',
          value: {},
          commitId: Schema.decodeSync(CommitId)('test-library-commit'),
          changes: { scopes: [] },
        }),
    }),
  ),
  Layer.succeed(
    DataPortabilityRuntime,
    DataPortabilityRuntime.of({
      export: Effect.succeed('{}'),
      import: () => Effect.succeed({ imported: 1 }),
    }),
  ),
);

const HandlerLayer = BibleProcedureHandlers.pipe(Layer.provide(Dependencies));

type ProcedureHandlers = Rpc.ToHandler<RpcGroup.Rpcs<typeof BibleProcedureGroup>>;

const run = <A, E, R>(effect: Effect.Effect<A, E, ProcedureHandlers | R>): Effect.Effect<A, E, R> =>
  effect.pipe(Effect.provide(HandlerLayer));

describe('BibleProcedureHandlers', () => {
  it.scoped('serves canonical domain values through the real RPC client/server path', () =>
    Effect.gen(function* () {
      const result = yield* run(
        Effect.gen(function* () {
          const client = yield* RpcTest.makeClient(BibleProcedureGroup);
          const foundChapter = yield* client['v1.reading.bibleChapter.get']({
            book: genesis.number,
            chapter: chapter.reference.chapter,
          });
          const search = yield* client['v1.reading.bibleSearch.get']({
            query: 'beginning',
            limit: 20,
          });
          const catalog = yield* client['v1.reading.writingsCatalog.get']({});
          const writingsLibrary = yield* client['v1.reading.writingsLibrary.get']({});
          const downloaded = yield* client['v1.reading.writingsPublication.download']({
            publicationId: remotePublication.id,
          });
          const topics = yield* client['v1.topics.list']({ query: 'resurrection' });
          const topic = yield* client['v1.topics.get']({ id: resurrectionTopic.id });
          const preferences = yield* client['v1.preferences.reading.get']({});
          const continuity = yield* client['v1.reading.continuity.get']({});
          const recorded = yield* client['v1.reading.continuity.record']({
            location: { source: 'bible', resourceId: 'KJV', location: '/bible/43/3/16' },
            progress: 0,
          });
          return {
            foundChapter,
            search,
            catalog,
            writingsLibrary,
            downloaded,
            topics,
            topic,
            preferences,
            continuity,
            recorded,
          };
        }),
      );

      expect(result.foundChapter.verses[0]?.text).toStartWith('In the beginning');
      expect(result.search.total).toBe(1);
      expect(result.search.hits[0]?.verse.text).toStartWith('In the beginning');
      expect(result.catalog).toEqual([]);
      expect(result.writingsLibrary).toEqual([remotePublication]);
      expect(result.downloaded).toMatchObject({ code: 'PP', status: 'success' });
      expect(result.topics).toEqual([
        {
          id: resurrectionTopic.id,
          name: resurrectionTopic.name,
          alternativeNames: [],
        },
      ]);
      expect(result.topic.sections[0]?.references[0]?.osis).toEqual(['John.11.25']);
      expect(result.preferences).toEqual(DEFAULT_READING_PREFERENCES);
      expect(result.continuity).toEqual({
        source: 'bible',
        resourceId: 'KJV',
        location: '/bible/43/3/16',
      });
      expect(result.recorded.changes.scopes).toEqual([{ _tag: 'ReadingContinuity' }]);
    }),
  );

  it.scoped('normalizes domain failures at the procedure seam', () =>
    Effect.gen(function* () {
      const result = yield* run(
        Effect.gen(function* () {
          const client = yield* RpcTest.makeClient(BibleProcedureGroup);
          return yield* Effect.result(
            client['v1.reading.bibleChapter.get']({
              book: genesis.number,
              chapter: BibleReference.chapter(1, 2).chapter,
            }),
          );
        }),
      );

      expect(result._tag).toBe('Failure');
      if (result._tag === 'Failure') {
        expect(result.failure).toMatchObject({
          _tag: 'ProcedureError',
          procedure: 'v1.reading.bibleChapter.get',
          code: 'BibleChapterNotFoundError',
        });
      }
    }),
  );

  it.scoped('streams runtime events from an explicit cursor', () =>
    Effect.gen(function* () {
      const events = yield* run(
        Effect.gen(function* () {
          const client = yield* RpcTest.makeClient(BibleProcedureGroup);
          return yield* Stream.runCollect(
            client['v1.runtime.events']({
              afterSequence: Schema.decodeSync(RuntimeEventSequence)(0),
            }),
          );
        }),
      );

      expect([...events]).toEqual([]);
    }),
  );
});
