import { BibleCorpus, BibleDatabase } from '@bible/core/bible-db';
import { BibleService } from '@bible/core/bible/service';
import { ContentUpdate, layerHttpContentManifest } from '@bible/core/content-update';
import {
  CorpusSupply,
  layerEgwWritingsAssetSource,
  layerWritingsLibraryRuntime,
} from '@bible/core/corpus-supply';
import { EGWParagraphDatabase } from '@bible/core/egw-db';
import { EGWApiClient, EGWAuth } from '@bible/core/egw';
import { LibraryEntityId } from '@bible/core/library-state';
import userStateMigrationSql from '@bible/core/local-first/migrations/0001_user_state.sql';
import { ClientId, MutationId, Timestamp } from '@bible/core/local-first';
import {
  CommitId,
  type LibraryStateRuntime,
  type DataPortabilityRuntime,
  type ProcedureRuntime,
  type ReadingContinuityRuntime,
  type ReadingPreferencesRuntime,
  type WritingsLibraryRuntime,
  RuntimeGeneration,
} from '@bible/core/procedure';
import { WritingsService } from '@bible/core/writings/service';
import { EGWCommentaryService } from '@bible/core/egw-commentary';
import {
  layerFileVectorIndexBytes,
  SearchCorpusSources,
  SearchService,
  VectorIndexBytes,
} from '@bible/core/search';
import { layerNodeEmbedder } from '@bible/core/search/node';
import { StudyService } from '@bible/core/study';
import { TopicService } from '@bible/core/topics';
import {
  layerReloadableArtifact,
  layerReloadOnActivation,
  type ReloadableArtifact,
  LookupService,
  WikiSectionSources,
  WikiService,
} from '@bible/core/wiki';
import * as SqliteNode from '@effect/sql-sqlite-node/SqliteClient';
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodeHttpClient from '@effect/platform-node/NodeHttpClient';
import * as NodePath from '@effect/platform-node/NodePath';
import {
  Effect,
  Layer,
  ManagedRuntime,
  Option,
  Schema,
  type Effect as EffectNs,
  type FileSystem,
} from 'effect';

import { layerDesktopProcedureDependencies } from './local-procedure-runtime.js';
import { topicsArtifactDriver } from './topics-artifact-driver.js';

/**
 * Main-process Effect runtime. Hosts:
 *   - EGWParagraphDatabase (local writings corpus)
 *   - canonical Bible and user-state databases
 *   - the same procedure and sync runtime used by the web worker
 */
const writingsDbLayer = (filename: string): Layer.Layer<EGWParagraphDatabase> =>
  EGWParagraphDatabase.layerCore.pipe(Layer.provide(SqliteNode.layer({ filename })), Layer.orDie);

const bibleDbLayer = (
  filename: string,
): Layer.Layer<BibleCorpus | BibleDatabase | BibleService | TopicService> => {
  const driver = SqliteNode.layer({ filename });
  const database = Layer.merge(BibleCorpus.layer, BibleDatabase.layer).pipe(
    Layer.provide(driver),
    Layer.orDie,
  );
  const bible = BibleService.Live.pipe(Layer.provide(database), Layer.orDie);
  const topics = TopicService.Live.pipe(Layer.provide(driver), Layer.orDie);
  return Layer.mergeAll(database, bible, topics);
};

/** The wiki on Electron main: the same portable `WikiService` and the same
 *  portable composer the worker and the CLI run, over this host's SQLite
 *  driver. The identical composed page on all three is the point — nothing
 *  about a section's contents is decided here.
 *
 *  A *missing* `topics.db` becomes `WikiService.Absent` — §3.5 makes an absent
 *  artifact catalog-only pages. A *present but unreadable* one stays
 *  `WikiService.Broken`, because an artifact that will not open is a fault the
 *  operator needs surfaced rather than smoothed into "not installed". Core's
 *  `layerReloadableArtifact` makes that split; this host only supplies the
 *  driver. */
const sectionSourcesLayer = (input: {
  readonly bible: Layer.Layer<BibleCorpus | BibleDatabase | BibleService | TopicService>;
  readonly writings: Layer.Layer<EGWParagraphDatabase>;
}): Layer.Layer<WikiSectionSources> =>
  WikiSectionSources.Live.pipe(
    Layer.provide(input.bible),
    Layer.provide(WritingsService.Live.pipe(Layer.provide(input.writings))),
    Layer.provide(EGWCommentaryService.Live.pipe(Layer.provide(input.writings))),
    // Corpora that will not open still provide the tag — as `NotWired`, so the
    // page reports `sections-not-wired` rather than six unexplained empties.
    // *Only* corpora that will not open: the shared combinator lets defects and
    // interruption keep going up, so a construction fault in main reaches the
    // operator instead of arriving at the reader as a degradation state.
    WikiSectionSources.NotWiredOnCorpusAbsence,
    Layer.orDie,
  );

/** The reloadable variant rather than the plain one, because this host is the
 *  one §3.6 updates *while it runs*. The install ends in an atomic rename over
 *  `topics.db`, and the `immutable=1` connection main opened holds the previous
 *  inode — so without a reload seam an accepted offer changed the file and
 *  changed nothing the reader could see until the app was restarted (round-3
 *  F3). The CLI keeps `layerArtifactOrAbsent`: its next read is a new process. */
const wikiLayer = (input: {
  readonly topicsDbFile: string;
  readonly bible: Layer.Layer<BibleCorpus | BibleDatabase | BibleService | TopicService>;
  readonly sources: Layer.Layer<WikiSectionSources>;
}): Layer.Layer<WikiService | ReloadableArtifact, never, FileSystem.FileSystem> =>
  layerReloadableArtifact(topicsArtifactDriver, input.topicsDbFile).pipe(
    Layer.provide(input.bible),
    Layer.provide(input.sources),
  );

/** Select-to-lookup on Electron main (§7): the same portable `LookupService`
 *  the worker and the CLI resolve, over the two dependencies the wiki already
 *  has. No new corpus and no new file handle — the seam is what was missing. */
const lookupLayer = (input: {
  readonly wiki: Layer.Layer<WikiService>;
  readonly sources: Layer.Layer<WikiSectionSources>;
}): Layer.Layer<LookupService> =>
  LookupService.Live.pipe(Layer.provide(input.wiki), Layer.provide(input.sources));

/** The study seam on Electron main (§8.1): the same portable `StudyService`
 *  the worker and the CLI resolve, over this host's two SQLite drivers. Both
 *  corpora are already open for the reader and the wiki, so the bundle costs no
 *  new file handle — only the seam that was missing. */
const studyLayer = (input: {
  readonly bible: Layer.Layer<BibleCorpus | BibleDatabase | BibleService | TopicService>;
  readonly writings: Layer.Layer<EGWParagraphDatabase>;
}): Layer.Layer<StudyService> =>
  StudyService.Live.pipe(
    Layer.provide(input.bible),
    Layer.provide(EGWCommentaryService.Live.pipe(Layer.provide(input.writings))),
  );

/** Hybrid search on Electron main (§9): the same portable `SearchService` the
 *  worker and the CLI resolve, over this host's two SQLite drivers.
 *
 *  The vector index is read from `userData` when it is there and reported as
 *  §9.6's typed absence when it is not — which is every install until the
 *  optional artifact ships, so the absent path is the ordinary one rather than
 *  an error path. The native CPU adapter is provided either way: if the model
 *  is not present it declines, and the result says `embedder` instead. */
const searchLayer = (input: {
  readonly wiki: Layer.Layer<WikiService>;
  readonly writings: Layer.Layer<EGWParagraphDatabase>;
  /** The *activated* index, or `None` when CorpusSupply verified none.
   *
   *  An `Option` rather than a path that might not exist: "this host has no
   *  index" is a supported state (§9.6), and `VectorIndexBytes.None` is how it
   *  is written down. A path string would make the reader stat a file to
   *  discover a decision the host had already made. */
  readonly vectorIndexFile: Option.Option<string>;
}): Layer.Layer<SearchService> =>
  SearchService.Live.pipe(
    Layer.provide(
      Layer.effect(
        SearchCorpusSources,
        Effect.gen(function* () {
          return SearchCorpusSources.of({
            _tag: 'wired' as const,
            sources: { paragraphs: yield* EGWParagraphDatabase, wiki: yield* WikiService },
          });
        }),
      ).pipe(Layer.provide(input.writings), Layer.provide(input.wiki)),
    ),
    Layer.provide(
      Option.match(input.vectorIndexFile, {
        onNone: () => VectorIndexBytes.None,
        onSome: (filename) =>
          layerFileVectorIndexBytes(filename).pipe(Layer.provide(NodeFileSystem.layer)),
      }),
    ),
    Layer.provide(layerNodeEmbedder),
  );

export type MainRuntime = ManagedRuntime.ManagedRuntime<
  | EGWParagraphDatabase
  | BibleCorpus
  | BibleDatabase
  | BibleService
  | WritingsService
  | ProcedureRuntime
  | ReadingContinuityRuntime
  | ReadingPreferencesRuntime
  | WritingsLibraryRuntime
  | LibraryStateRuntime
  | TopicService
  | WikiService
  | LookupService
  | StudyService
  | SearchService
  | ContentUpdate
  | ReloadableArtifact
  | DataPortabilityRuntime,
  never
>;

export interface MainRuntimeHost {
  readonly randomUuid: () => string;
  readonly nowIso: () => string;
}

export interface MainRuntimeFiles {
  readonly writingsDbFile: string;
  readonly bibleDbFile: string;
  /** The topics artifact. May not exist — §3.5 makes an absent artifact a
   *  degradation, so the layer resolves it at construction and falls back to
   *  catalog-only pages rather than refusing to build. */
  readonly topicsDbFile: string;
  readonly userStateDbFile: string;
  /** §9.2's optional flat vector index. Absent on every install until the
   *  artifact ships; search degrades around it rather than failing. */
  readonly vectorIndexFile: Option.Option<string>;
  /** The File Corpus supply main already built and bootstrapped this launch
   *  with — the same recipes, destinations and installers.
   *
   *  Passed in rather than rebuilt here because a second construction would be
   *  a second set of destinations and sources: §3.6's `update` must install
   *  through the *same* installer that verified the running generation, or
   *  "the digest mismatch left the installed generation active" would be a
   *  guarantee about a different file than the one the reader has open. */
  readonly corpusSupply: Layer.Layer<CorpusSupply>;
}

export const makeRuntime = (files: MainRuntimeFiles, host: MainRuntimeHost): MainRuntime => {
  const writings = writingsDbLayer(files.writingsDbFile);
  const platform = Layer.mergeAll(
    NodeFileSystem.layer,
    NodePath.layer,
    NodeHttpClient.layerNodeHttp,
  );
  const auth = EGWAuth.layerLiveFs().pipe(Layer.provide(platform));
  const api = EGWApiClient.Live.pipe(
    Layer.provide(auth),
    Layer.provide(NodeHttpClient.layerNodeHttp),
  );
  const writingsSource = layerEgwWritingsAssetSource.pipe(Layer.provide(api));
  const corpusSupply = CorpusSupply.layer.pipe(
    Layer.provide(writingsSource),
    Layer.provide(writings),
  );
  const writingsLibrary = layerWritingsLibraryRuntime.pipe(
    Layer.provide(writingsSource),
    Layer.provide(writings),
    Layer.provide(corpusSupply),
    Layer.orDie,
  );
  const bible = bibleDbLayer(files.bibleDbFile);
  const sources = sectionSourcesLayer({ bible, writings });
  const wiki = wikiLayer({ topicsDbFile: files.topicsDbFile, bible, sources }).pipe(
    // The artifact's existence check runs before any driver opens the path, so
    // the wiki needs a real filesystem rather than only a SQLite driver.
    Layer.provide(NodeFileSystem.layer),
  );
  const lookup = lookupLayer({ wiki, sources });
  const clientId = Schema.decodeSync(ClientId)('desktop-local');
  const procedures = layerDesktopProcedureDependencies({
    writingsDatabase: writings,
    bible,
    writingsLibrary,
    userStateDbFile: files.userStateDbFile,
    migrationSql: userStateMigrationSql,
    runtime: {
      clientId,
      generation: Schema.decodeSync(RuntimeGeneration)(host.randomUuid()),
      capabilities: ['external-links', 'file-import', 'file-export', 'window-controls'],
      nextMutationId: () => Schema.decodeSync(MutationId)(host.randomUuid()),
      nextHistoryId: () => Schema.decodeSync(LibraryEntityId)(host.randomUuid()),
      nextCommitId: () => Schema.decodeSync(CommitId)(host.randomUuid()),
      now: () => Schema.decodeSync(Timestamp)(host.nowIso()),
    },
  });
  const study = studyLayer({ bible, writings });
  const search = searchLayer({
    wiki,
    writings,
    vectorIndexFile: files.vectorIndexFile,
  });
  // §3.6 on Electron main: the portable policy over this host's own HTTP stack,
  // reading the manifest directly — no proxy, because main is not a browser and
  // has no origin to be same as. The supply is main's, not the writings-only one
  // above, so an accepted offer installs through the very installer that
  // verified what is running.
  const content = ContentUpdate.Live.pipe(
    Layer.provide(files.corpusSupply),
    Layer.provide(layerHttpContentManifest),
    Layer.provide(NodeHttpClient.layerNodeHttp),
    // The reader reopens on activation. `wiki` is the *same* built layer that
    // is merged below — layer memoization by tag is what makes this the live
    // handle rather than a second, unread copy of it.
    Layer.provide(layerReloadOnActivation.pipe(Layer.provide(wiki))),
  );
  return ManagedRuntime.make(
    Layer.mergeAll(writings, bible, wiki, lookup, study, search, content, procedures),
  );
};

export const runtimeRun = <A, E>(
  runtime: MainRuntime,
  effect: EffectNs.Effect<
    A,
    E,
    | EGWParagraphDatabase
    | BibleCorpus
    | BibleDatabase
    | BibleService
    | WritingsService
    | ProcedureRuntime
    | ReadingContinuityRuntime
    | ReadingPreferencesRuntime
    | WritingsLibraryRuntime
    | LibraryStateRuntime
    | TopicService
    | WikiService
    | LookupService
    | StudyService
    | SearchService
    | ContentUpdate
    | ReloadableArtifact
    | DataPortabilityRuntime
  >,
): Promise<A> => runtime.runPromise(effect);
