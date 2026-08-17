/** The procedure group's dependency graph, for tests that only care about one
 *  corner of it.
 *
 *  `BibleProcedureHandlers` requires every service the group declares, so a
 *  suite testing *one* procedure still has to supply the other twenty-odd. That
 *  is not a property of any feature — it is a property of the group — so it
 *  lives here rather than beside whichever feature was added last.
 *
 *  It moved out of `study/testing.ts` because owning it there had the wrong
 *  shape: the study fixtures were carrying the whole graph, so adding an RPC to
 *  any *other* feature meant editing a study file, and the wiki parity suite had
 *  already given up and written its own second copy
 *  (`wiki/host-parity.test.ts`). Two spellings of "everything else" drift by
 *  construction; this is one, and `study/testing.ts` now holds only study
 *  fixtures.
 *
 *  Nothing here is under test anywhere. Every stub is the least-answer that
 *  lets the layer build — an empty list, a fixed commit — and a suite that
 *  *does* care about one of these services overrides it through
 *  {@link procedureDependencies}'s options rather than restating the rest.
 */

import { Effect, Layer, Schema, Stream } from 'effect';

import { BibleDatabase } from '../bible-db/bible-database.js';
import { BibleService } from '../bible/service.js';
import { EGWCommentaryService } from '../egw-commentary/service.js';
import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import { DEFAULT_READING_PREFERENCES } from '../reading-preferences/model.js';
import { StudyService } from '../study/service.js';
import { TopicService } from '../topics/service.js';
import { WikiSectionSources } from '../wiki/section-composer.js';
import { LookupService } from '../wiki/lookup-service.js';
import { WikiService } from '../wiki/service.js';
import { WritingsService } from '../writings/service.js';
import {
  CommitId,
  CURRENT_PROTOCOL_VERSION,
  CURRENT_RUNTIME_SCHEMA_VERSION,
  RuntimeConnection,
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

/** Which services a suite supplies itself.
 *
 *  Every field is a layer this module would otherwise stub. Passing one means
 *  "this is the service under test"; omitting it means "build it so the handler
 *  layer resolves, and do not read anything from it". */
export interface ProcedureDependencyOverrides {
  /** Names the fixture in `RuntimeConnection.generation`, so a suite that reads
   *  the connection can tell whose stub answered. */
  readonly generation?: string;
  readonly bible?: Layer.Layer<BibleService>;
  readonly writings?: Layer.Layer<WritingsService>;
  readonly topics?: Layer.Layer<TopicService>;
  readonly wiki?: Layer.Layer<WikiService>;
  readonly lookup?: Layer.Layer<LookupService>;
  readonly study?: Layer.Layer<StudyService>;
}

interface EmptyCommit {
  readonly _tag: 'MutationCommit';
  readonly value: {};
  readonly commitId: CommitId;
  readonly changes: { readonly scopes: readonly [] };
}

const commit = (id: string): Effect.Effect<EmptyCommit> =>
  Effect.succeed({
    _tag: 'MutationCommit',
    value: {},
    commitId: Schema.decodeSync(CommitId)(id),
    changes: { scopes: [] },
  });

/** A `StudyService` over empty corpora: it answers, and answers with nothing.
 *  The layer for a suite that is not testing the study seam but must still
 *  build the handler layer. */
const emptyStudy: Layer.Layer<StudyService> = StudyService.Live.pipe(
  Layer.provide(BibleDatabase.layerTest()),
  Layer.provide(EGWCommentaryService.Test()),
);

const emptyWritings: Layer.Layer<WritingsService> = WritingsService.Live.pipe(
  Layer.provide(EGWParagraphDatabase.Test({ books: [], paragraphs: [] })),
);

const emptyWiki: Layer.Layer<WikiService> = WikiService.Absent.pipe(
  Layer.provide(TopicService.Test([])),
  Layer.provide(WikiSectionSources.NotWired),
);

/** A `LookupService` over an absent artifact and no section sources: it
 *  answers, and answers with five empty groups (§7). The same posture
 *  `emptyWiki` takes, for the same reason — a suite that is not testing the
 *  lookup seam must still be able to build the handler layer. */
const emptyLookup: Layer.Layer<LookupService> = LookupService.Live.pipe(
  Layer.provide(emptyWiki),
  Layer.provide(WikiSectionSources.NotWired),
);

/** Everything `BibleProcedureHandlers` requires, with the named services
 *  replaced by the caller's own.
 *
 *  Returns one merged layer rather than a record of layers, because that is the
 *  shape every call site wants: `BibleProcedureHandlers.pipe(Layer.provide(…))`.
 */
export const procedureDependencies = (
  overrides: ProcedureDependencyOverrides = {},
): Layer.Layer<
  | BibleService
  | WritingsService
  | TopicService
  | WikiService
  | LookupService
  | StudyService
  | WritingsLibraryRuntime
  | ProcedureRuntime
  | ReadingContinuityRuntime
  | ReadingPreferencesRuntime
  | LibraryStateRuntime
  | DataPortabilityRuntime
> => {
  const generation = overrides.generation ?? 'procedure-fixture';
  return Layer.mergeAll(
    overrides.bible ?? BibleService.Test({ books: [], chapters: new Map(), searchHits: [] }),
    overrides.writings ?? emptyWritings,
    overrides.topics ?? TopicService.Test([]),
    overrides.wiki ?? emptyWiki,
    overrides.lookup ?? emptyLookup,
    overrides.study ?? emptyStudy,
    Layer.succeed(
      WritingsLibraryRuntime,
      WritingsLibraryRuntime.of({
        get: Effect.succeed([]),
        download: () => Effect.die('not exercised by this suite'),
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
              generation: Schema.decodeSync(RuntimeGeneration)(generation),
              capabilities: [],
            }),
          ),
        events: () => Stream.empty,
      }),
    ),
    Layer.succeed(
      ReadingContinuityRuntime,
      ReadingContinuityRuntime.of({
        get: Effect.succeedNone,
        record: () => commit(`${generation}-continuity`),
      }),
    ),
    Layer.succeed(
      ReadingPreferencesRuntime,
      ReadingPreferencesRuntime.of({
        get: Effect.succeed(DEFAULT_READING_PREFERENCES),
        patch: () =>
          Effect.succeed({
            _tag: 'MutationCommit',
            value: DEFAULT_READING_PREFERENCES,
            commitId: Schema.decodeSync(CommitId)(`${generation}-preferences`),
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
        mutate: () => commit(`${generation}-library`),
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
};
