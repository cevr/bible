import { BibleCorpus, BibleDatabase } from '@bible/core/bible-db';
import { BibleService } from '@bible/core/bible/service';
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
import { StudyService } from '@bible/core/study';
import { TopicService } from '@bible/core/topics';
import { layerArtifactOrAbsent, WikiSectionSources, type WikiService } from '@bible/core/wiki';
import * as SqliteNode from '@effect/sql-sqlite-node/SqliteClient';
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodeHttpClient from '@effect/platform-node/NodeHttpClient';
import * as NodePath from '@effect/platform-node/NodePath';
import { Layer, ManagedRuntime, Schema, type Effect as EffectNs, type FileSystem } from 'effect';

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
 *  `layerArtifactOrAbsent` makes that split; this host only supplies the
 *  driver. */
const wikiLayer = (input: {
  readonly topicsDbFile: string;
  readonly bible: Layer.Layer<BibleCorpus | BibleDatabase | BibleService | TopicService>;
  readonly writings: Layer.Layer<EGWParagraphDatabase>;
}): Layer.Layer<WikiService, never, FileSystem.FileSystem> => {
  const sources = WikiSectionSources.Live.pipe(
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
  return layerArtifactOrAbsent(topicsArtifactDriver, input.topicsDbFile).pipe(
    Layer.provide(input.bible),
    Layer.provide(sources),
  );
};

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
  | StudyService
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
  const wiki = wikiLayer({ topicsDbFile: files.topicsDbFile, bible, writings }).pipe(
    // The artifact's existence check runs before any driver opens the path, so
    // the wiki needs a real filesystem rather than only a SQLite driver.
    Layer.provide(NodeFileSystem.layer),
  );
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
  return ManagedRuntime.make(Layer.mergeAll(writings, bible, wiki, study, procedures));
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
    | StudyService
    | DataPortabilityRuntime
  >,
): Promise<A> => runtime.runPromise(effect);
