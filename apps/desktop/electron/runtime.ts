import { BibleCorpus, BibleDatabase } from '@bible/core/bible-db';
import { BibleService } from '@bible/core/bible/service';
import { EGWParagraphDatabase } from '@bible/core/egw-db';
import userStateMigrationSql from '@bible/core/local-first/migrations/0001_user_state.sql';
import { ClientId, MutationId, Timestamp } from '@bible/core/local-first';
import {
  CommitId,
  type LibraryStateRuntime,
  type ProcedureRuntime,
  type ReadingPreferencesRuntime,
  RuntimeGeneration,
} from '@bible/core/procedure';
import type { WritingsService } from '@bible/core/writings/service';
import { TopicService } from '@bible/core/topics';
import * as SqliteNode from '@effect/sql-sqlite-node/SqliteClient';
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
  | ReadingPreferencesRuntime
  | LibraryStateRuntime
  | TopicService,
  never
>;

export const makeRuntime = (
  writingsDbFile: string,
  bibleDbFile: string,
  userStateDbFile: string,
): MainRuntime => {
  const writings = writingsDbLayer(writingsDbFile);
  const bible = bibleDbLayer(bibleDbFile);
  const clientId = Schema.decodeSync(ClientId)('desktop-local');
  const procedures = layerDesktopProcedureDependencies({
    writingsDatabase: writings,
    bible,
    userStateDbFile,
    migrationSql: userStateMigrationSql,
    runtime: {
      clientId,
      generation: Schema.decodeSync(RuntimeGeneration)(crypto.randomUUID()),
      capabilities: ['external-links', 'file-import', 'file-export', 'window-controls'],
      nextMutationId: () => Schema.decodeSync(MutationId)(crypto.randomUUID()),
      nextCommitId: () => Schema.decodeSync(CommitId)(crypto.randomUUID()),
      now: () => Schema.decodeSync(Timestamp)(new Date().toISOString()),
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
    | ReadingPreferencesRuntime
    | LibraryStateRuntime
    | TopicService
  >,
): Promise<A> => runtime.runPromise(effect);
