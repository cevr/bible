import { describe, expect, test } from 'bun:test';
import { BIBLE_BOOKS } from '../bible/canon.js';
import { Chapter, Reference as BibleReference, SearchHit, Verse } from '../bible/model.js';
import { BibleService } from '../bible/service.js';
import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import {
  DEFAULT_READING_PREFERENCES,
  applyReadingPreferencesPatch,
} from '../reading-preferences/model.js';
import { WritingsService } from '../writings/service.js';
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
import { LibraryStateRuntime, ProcedureRuntime, ReadingPreferencesRuntime } from './services.js';

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
);

const HandlerLayer = BibleProcedureHandlers.pipe(Layer.provide(Dependencies));

type ProcedureHandlers = Rpc.ToHandler<RpcGroup.Rpcs<typeof BibleProcedureGroup>>;

const run = <A, E>(effect: Effect.Effect<A, E, ProcedureHandlers>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(HandlerLayer)));

describe('BibleProcedureHandlers', () => {
  test('serves canonical domain values through the real RPC client/server path', async () => {
    const result = await run(
      Effect.scoped(
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
          const topics = yield* client['v1.topics.list']({ query: 'resurrection' });
          const topic = yield* client['v1.topics.get']({ id: resurrectionTopic.id });
          const preferences = yield* client['v1.preferences.reading.get']({});
          return { foundChapter, search, catalog, topics, topic, preferences };
        }),
      ),
    );

    expect(result.foundChapter.verses[0]?.text).toStartWith('In the beginning');
    expect(result.search.total).toBe(1);
    expect(result.search.hits[0]?.verse.text).toStartWith('In the beginning');
    expect(result.catalog).toEqual([]);
    expect(result.topics).toEqual([
      {
        id: resurrectionTopic.id,
        name: resurrectionTopic.name,
        alternativeNames: [],
      },
    ]);
    expect(result.topic.sections[0]?.references[0]?.osis).toEqual(['John.11.25']);
    expect(result.preferences).toEqual(DEFAULT_READING_PREFERENCES);
  });

  test('normalizes domain failures at the procedure seam', async () => {
    const result = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const client = yield* RpcTest.makeClient(BibleProcedureGroup);
          return yield* Effect.result(
            client['v1.reading.bibleChapter.get']({
              book: genesis.number,
              chapter: BibleReference.chapter(1, 2).chapter,
            }),
          );
        }),
      ),
    );

    expect(result._tag).toBe('Failure');
    if (result._tag === 'Failure') {
      expect(result.failure).toMatchObject({
        _tag: 'ProcedureError',
        procedure: 'v1.reading.bibleChapter.get',
        code: 'BibleChapterNotFoundError',
      });
    }
  });

  test('streams runtime events from an explicit cursor', async () => {
    const events = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const client = yield* RpcTest.makeClient(BibleProcedureGroup);
          return yield* Stream.runCollect(
            client['v1.runtime.events']({
              afterSequence: Schema.decodeSync(RuntimeEventSequence)(0),
            }),
          );
        }),
      ),
    );

    expect([...events]).toEqual([]);
  });
});
