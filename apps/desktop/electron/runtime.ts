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
import type { WritingsService } from '@bible/core/writings/service';
import { TopicService } from '@bible/core/topics';
import * as SqliteNode from '@effect/sql-sqlite-node/SqliteClient';
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodeHttpClient from '@effect/platform-node/NodeHttpClient';
import * as NodePath from '@effect/platform-node/NodePath';
import { Layer, ManagedRuntime, Schema } from 'effect';
import type { Effect as EffectNs } from 'effect';

import { layerDesktopProcedureDependencies } from './local-procedure-runtime.js';

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
  | DataPortabilityRuntime,
  never
>;

export interface MainRuntimeHost {
  readonly randomUuid: () => string;
  readonly nowIso: () => string;
}

export const makeRuntime = (
  writingsDbFile: string,
  bibleDbFile: string,
  userStateDbFile: string,
  host: MainRuntimeHost,
): MainRuntime => {
  const writings = writingsDbLayer(writingsDbFile);
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
  const bible = bibleDbLayer(bibleDbFile);
  const clientId = Schema.decodeSync(ClientId)('desktop-local');
  const procedures = layerDesktopProcedureDependencies({
    writingsDatabase: writings,
    bible,
    writingsLibrary,
    userStateDbFile,
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
  return ManagedRuntime.make(Layer.mergeAll(writings, bible, procedures));
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
    | DataPortabilityRuntime
  >,
): Promise<A> => runtime.runPromise(effect);
