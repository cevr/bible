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
import { BibleDatabase } from '../bible-db/bible-database.js';
import {
  ContentActivation,
  ContentManifestSource,
  ContentUpdate,
} from '../content-update/service.js';
import { CorpusSupply } from '../corpus-supply/service.js';
import { EGWCommentaryService } from '../egw-commentary/service.js';
import { StudyService } from '../study/service.js';
import { strongsNumber } from '../study/model.js';
import {
  FIXTURE_BOOK,
  FIXTURE_CHAPTER,
  FIXTURE_MALFORMED_ROW,
  FIXTURE_VERSE,
  malformedStudyProcedureDependencies,
} from '../study/testing.js';
import { WikiSectionSources } from '../wiki/section-composer.js';
import { SearchCorpusSources, SearchService } from '../search/service.js';
import { VectorIndexBytes } from '../search/vector-artifact.js';
import { LookupService } from '../wiki/lookup-service.js';
import { WikiService } from '../wiki/service.js';
import { topicSlug, WikiPassageRef, WikiVerseRef } from '../wiki/model.js';
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

// Wire-shape fields the schema encodes as `null` when absent.
const wireNull = Option.getOrNull(Option.none<never>());

const genesis = BIBLE_BOOKS[0]!;
const chapter = Chapter.make({
  book: genesis,
  reference: BibleReference.chapter(1, 1),
  verses: [
    Verse.make({
      reference: BibleReference.verse(1, 1, 1),
      text: 'In the beginning God created the heaven and the earth.',
    }),
  ],
  previous: Option.none(),
  next: Option.some(BibleReference.chapter(1, 2)),
});

const resurrectionTopic = TopicDetail.make({
  id: Schema.decodeSync(TopicId)('naves-topical-bible.resurrection'),
  name: 'RESURRECTION',
  alternativeNames: [],
  sections: [
    TopicSection.make({
      label: 'General references',
      references: [TopicReference.make({ raw: 'John 11:25', osis: ['John.11.25'] })],
    }),
  ],
});

const remotePublication = WritingsLibraryPublication.make({
  id: publicationId(127),
  code: publicationCode('PP'),
  title: 'Patriarchs and Prophets',
  author: 'Ellen G. White',
  paragraphCount: 0,
  source: 'remote',
  status: 'pending',
  error: wireNull,
});

const Dependencies = Layer.mergeAll(
  BibleService.Test({
    books: [genesis],
    chapters: new Map([['1:1', chapter]]),
    searchHits: [
      SearchHit.make({
        book: genesis,
        verse: chapter.verses[0],
      }),
    ],
  }),
  WritingsService.Live.pipe(
    Layer.provide(EGWParagraphDatabase.Test({ books: [], paragraphs: [] })),
  ),
  TopicService.Test([resurrectionTopic]),
  // The wiki with no topics artifact — the §3.5 steady state until the first
  // content release. Its pages still compose the §6.1 lineup out of the
  // catalog, Bible, writings and commentary sources below, which is exactly
  // what makes this an honest exercise of the RPC seam rather than a stub
  // returning a hardcoded page.
  WikiService.Absent.pipe(
    Layer.provide(TopicService.Test([resurrectionTopic])),
    Layer.provide(
      WikiSectionSources.Live.pipe(
        Layer.provide(TopicService.Test([resurrectionTopic])),
        Layer.provide(BibleDatabase.layerTest()),
        Layer.provide(EGWCommentaryService.Test()),
        Layer.provide(
          WritingsService.Live.pipe(
            Layer.provide(EGWParagraphDatabase.Test({ books: [], paragraphs: [] })),
          ),
        ),
      ),
    ),
  ),
  // Hybrid search (§9), over the same absent artifact and no vector index: the
  // result resolves through the real service rather than a stub, so
  // `v1.search.query` exercises the seam it will in production and carries
  // §9.6's typed absence.
  SearchService.Live.pipe(
    Layer.provide(
      Layer.unwrap(
        Effect.gen(function* () {
          // `paragraphs` and nothing else: searching the writings stopped
          // depending on a wiki when the pinned-topics group moved off
          // `SearchResult`, so wiring one here no longer type-checks. This
          // mirrors `goldenSearchSources` in `search/golden-fixture.ts`.
          return SearchCorpusSources.wired({
            paragraphs: yield* EGWParagraphDatabase,
          });
        }),
      ).pipe(Layer.provide(EGWParagraphDatabase.Test({ books: [], paragraphs: [] }))),
    ),
    Layer.provide(VectorIndexBytes.None),
  ),
  // Select-to-lookup (§7), over the same absent artifact and the same catalog:
  // the five groups resolve through the real service rather than a stub, so
  // `v1.wiki.lookup.resolve` exercises the seam it will in production.
  LookupService.Live.pipe(
    Layer.provide(
      WikiService.Absent.pipe(
        Layer.provide(TopicService.Test([resurrectionTopic])),
        Layer.provide(WikiSectionSources.NotWired),
      ),
    ),
    Layer.provide(
      WikiSectionSources.Live.pipe(
        Layer.provide(TopicService.Test([resurrectionTopic])),
        Layer.provide(BibleDatabase.layerTest()),
        Layer.provide(EGWCommentaryService.Test()),
        Layer.provide(
          WritingsService.Live.pipe(
            Layer.provide(EGWParagraphDatabase.Test({ books: [], paragraphs: [] })),
          ),
        ),
      ),
    ),
  ),
  // The study seam over the same two corpora the wiki sources use, so the
  // handler under test resolves a real `StudyService` rather than a stub.
  StudyService.Live.pipe(
    Layer.provide(BibleDatabase.layerTest()),
    Layer.provide(EGWCommentaryService.Test()),
  ),
  // The update seam (§3.6) over a host that wires no file corpus and can reach
  // no manifest: `v1.content.status` resolves through the real service and
  // answers `offline` with nothing installed, rather than through a stub.
  ContentUpdate.Live.pipe(
    Layer.provide(CorpusSupply.layer),
    Layer.provide(ContentManifestSource.Unreachable),
    Layer.provide(ContentActivation.Inert),
  ),
  Layer.succeed(
    WritingsLibraryRuntime,
    WritingsLibraryRuntime.of({
      get: Effect.succeed([remotePublication]),
      download: (id) =>
        Effect.succeed(
          WritingsDownloadResult.make({
            publicationId: id,
            code: remotePublication.code,
            status: 'success',
            paragraphCount: 42,
            error: wireNull,
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
          RuntimeConnection.make({
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
      get: Effect.succeed(
        Option.some({ source: 'bible', resourceId: 'KJV', location: '/bible/43/3/16' }),
      ),
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

  it.scoped('serves the composed wiki page, listing and dictionary over RPC', () =>
    Effect.gen(function* () {
      const result = yield* run(
        Effect.gen(function* () {
          const client = yield* RpcTest.makeClient(BibleProcedureGroup);
          return {
            page: yield* client['v1.wiki.topic.get']({
              slug: topicSlug('naves-topical-bible.resurrection'),
            }),
            list: yield* client['v1.wiki.topics.list']({}),
            dictionary: yield* client['v1.wiki.dictionary.get']({}),
          };
        }),
      );

      // The whole §6.1 lineup crosses the wire, in order, with the §5 arrival
      // rule on it. A UI that hardcoded "section 1 is open" would be reading a
      // fact the page already carries — and the CLI, which has no collapsing,
      // still reports the same flag.
      expect(result.page.sections.map((section) => section._tag)).toEqual([
        'key-verses',
        'egw-statements',
        'commentary',
        'pioneer-witnesses',
        'cross-references',
        'related-topics',
      ]);
      expect(result.page.sections.map((section) => section.defaultOpen)).toEqual([
        true,
        false,
        false,
        false,
        false,
        false,
      ]);
      // The catalog overlay really resolved: the one Nave's reference on the
      // fixture topic arrives as a navigable verse, not as an OSIS string.
      expect(result.page.sections[0].items).toEqual([
        WikiPassageRef.make({
          start: WikiVerseRef.make({
            book: BibleReference.verse(43, 11, 25).book,
            chapter: BibleReference.verse(43, 11, 25).chapter,
            verse: BibleReference.verse(43, 11, 25).verse,
            label: 'John 11:25',
            text: Option.none(),
          }),
          end: Option.none(),
          label: 'John 11:25',
          text: Option.none(),
        }),
      ]);
      expect(result.list.map((page) => String(page.slug))).toEqual([
        'naves-topical-bible.resurrection',
      ]);
      // No artifact installed, so no aliases — and the reason travels with the
      // empty payload rather than leaving a client to guess.
      expect(result.dictionary.entries).toEqual([]);
      expect(result.dictionary.unavailable).toEqual(Option.some('artifact-not-installed'));
    }),
  );

  it.scoped('streams runtime events from an explicit cursor', () =>
    Effect.gen(function* () {
      const events = yield* run(
        Effect.gen(function* () {
          const client = yield* RpcTest.makeClient(BibleProcedureGroup);
          return yield* Stream.runCollect(
            client['v1.runtime.events']({
              afterSequence: yield* Schema.decodeEffect(RuntimeEventSequence)(0),
            }),
          );
        }),
      );

      expect([...events]).toEqual([]);
    }),
  );
});

/** Should-fix 9: the study seam's corpus fault crosses the wire as itself.
 *
 *  A separate graph rather than another case in the suite above, because the
 *  claim needs a corpus that *is* faulty: the shared fixture is deliberately
 *  well-formed and every other assertion depends on it staying that way.
 */
describe('v1.study.* corpus faults', () => {
  const malformed = BibleProcedureHandlers.pipe(Layer.provide(malformedStudyProcedureDependencies));

  it.scoped('carries StudyCorpusDataError to the client with the row it names', () =>
    Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(BibleProcedureGroup);
      const outcome = yield* Effect.result(
        client['v1.study.verse.get']({
          book: FIXTURE_BOOK,
          chapter: FIXTURE_CHAPTER,
          verse: FIXTURE_VERSE,
        }),
      );

      expect(outcome._tag).toBe('Failure');
      if (outcome._tag !== 'Failure') return;

      // The tag, not `ProcedureError`. The handler used to run this through
      // `normalizeFailure`, which produced a `ProcedureError` whose `code` was
      // the string `'StudyCorpusDataError'` and whose payload was a message —
      // so the tag *looked* preserved while `source`, `operation` and `row`
      // were gone.
      expect(outcome.failure._tag).toBe('StudyCorpusDataError');
      if (outcome.failure._tag !== 'StudyCorpusDataError') return;

      // The three fields that make the failure actionable, having survived the
      // encode/decode the RPC boundary performs. `row` is the one that matters:
      // it is how an operator finds the paragraph to fix, and no message
      // reconstructs it.
      expect(outcome.failure.source).toBe('writings');
      expect(outcome.failure.operation).toBe('verse.parallelWritings');
      expect(outcome.failure.row).toContain(FIXTURE_MALFORMED_ROW);
    }).pipe(Effect.provide(malformed)),
  );

  it.scoped('still normalizes every other study failure to ProcedureError', () =>
    Effect.gen(function* () {
      // The other half, and the line the widening must not cross: only the
      // corpus-data error is special. A verse the corpus does not hold is an
      // ordinary domain failure and stays under the group's convention, so a
      // client matching on `ProcedureError` did not lose a case.
      const client = yield* RpcTest.makeClient(BibleProcedureGroup);
      const outcome = yield* Effect.result(
        client['v1.study.strongs.get']({ number: strongsNumber('H9999') }),
      );

      // The fixture holds no `H9999`, and an absent lexicon entry is a value
      // rather than a failure (§8.4), so this succeeds with an empty entry —
      // which is itself the claim that the widened union did not turn
      // sparseness into an error.
      expect(outcome._tag).toBe('Success');
      if (outcome._tag !== 'Success') return;
      expect(Option.isNone(outcome.success.entry)).toBe(true);
    }).pipe(Effect.provide(malformed)),
  );
});
