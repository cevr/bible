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
import { ProcedureRuntime, ReadingPreferencesRuntime } from './services.js';

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
          const preferences = yield* client['v1.preferences.reading.get']({});
          return { foundChapter, search, catalog, preferences };
        }),
      ),
    );

    expect(result.foundChapter.verses[0]?.text).toStartWith('In the beginning');
    expect(result.search.total).toBe(1);
    expect(result.search.hits[0]?.verse.text).toStartWith('In the beginning');
    expect(result.catalog).toEqual([]);
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
