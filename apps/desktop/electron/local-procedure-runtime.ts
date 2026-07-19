import type { BibleService } from '@bible/core/bible/service';
import type { EGWParagraphDatabase } from '@bible/core/egw-db';
import { makeSimulatedTransport } from '@bible/core/local-first';
import {
  layerLocalProcedureRuntime,
  type LibraryStateRuntime,
  type LocalProcedureRuntimeOptions,
  type ProcedureRuntime,
  type ReadingPreferencesRuntime,
} from '@bible/core/procedure';
import { WritingsService } from '@bible/core/writings/service';
import type { TopicService } from '@bible/core/topics';
import { Effect, Layer } from 'effect';

import { makeDesktopSyncStore, makeDesktopUserDatabase } from './user-state-database.js';

export interface DesktopProcedureDependenciesInput {
  readonly cacheDatabase: Layer.Layer<EGWParagraphDatabase>;
  readonly bible: Layer.Layer<BibleService | TopicService>;
  readonly userStateDbFile: string;
  readonly migrationSql: string;
  readonly runtime: Omit<LocalProcedureRuntimeOptions, 'store' | 'transport'>;
}

export const layerDesktopProcedureDependencies = (
  input: DesktopProcedureDependenciesInput,
): Layer.Layer<
  | BibleService
  | WritingsService
  | ProcedureRuntime
  | ReadingPreferencesRuntime
  | LibraryStateRuntime
  | TopicService
> => {
  const userDatabase = makeDesktopUserDatabase(input.userStateDbFile);
  const userDatabaseLifecycle = Layer.effectDiscard(
    Effect.acquireRelease(Effect.succeed(userDatabase), (database) => database.close).pipe(
      Effect.tap((database) => database.migrate(input.migrationSql)),
    ),
  );
  const localRuntime = layerLocalProcedureRuntime({
    ...input.runtime,
    store: makeDesktopSyncStore(userDatabase, input.runtime.clientId),
    transport: makeSimulatedTransport(),
  });
  const writings = WritingsService.Live.pipe(Layer.provide(input.cacheDatabase));
  return Layer.mergeAll(input.bible, writings, localRuntime, userDatabaseLifecycle).pipe(
    Layer.orDie,
  );
};
