import * as BrowserWorkerRunner from '@effect/platform-browser/BrowserWorkerRunner';
import { BibleDatabase } from '@bible/core/bible-db';
import { BibleService } from '@bible/core/bible/service';
import { CorpusSupply, layerWritingsLibraryRuntime } from '@bible/core/corpus-supply';
import { EGWParagraphDatabase } from '@bible/core/egw-db';
import {
  BibleProcedureGroup,
  BibleProcedureHandlers,
  layerLocalProcedureRuntime,
  type LocalProcedureRuntimeOptions,
} from '@bible/core/procedure';
import { WritingsService } from '@bible/core/writings/service';
import { TopicService } from '@bible/core/topics';
import { Layer } from 'effect';
import * as RpcServer from 'effect/unstable/rpc/RpcServer';

import type { SqliteDatabase } from './sqlite-database.js';
import { layerHttpWritingsAssetSource } from './writings-http-source.js';
import { layerWorkerSqlClient } from './worker-sql-client.js';

export interface ProcedureServerInput {
  readonly port: MessagePort;
  readonly bibleDatabase: SqliteDatabase;
  readonly writingsDatabase: SqliteDatabase;
  readonly writingsFetch: (url: string) => Promise<Response>;
  readonly runtime: LocalProcedureRuntimeOptions;
}

export const layerProcedureServer = (input: ProcedureServerInput) => {
  const writingsDatabase = EGWParagraphDatabase.layerCore.pipe(
    Layer.provide(layerWorkerSqlClient(input.writingsDatabase)),
  );
  const bible = BibleService.Live.pipe(
    Layer.provide(BibleDatabase.layer),
    Layer.provide(layerWorkerSqlClient(input.bibleDatabase)),
  );
  const writings = WritingsService.Live.pipe(Layer.provide(writingsDatabase));
  const writingsSource = layerHttpWritingsAssetSource(input.writingsFetch);
  const corpusSupply = CorpusSupply.layer.pipe(
    Layer.provide(writingsSource),
    Layer.provide(writingsDatabase),
  );
  const writingsLibrary = layerWritingsLibraryRuntime.pipe(
    Layer.provide(writingsSource),
    Layer.provide(writingsDatabase),
    Layer.provide(corpusSupply),
  );
  const topics = TopicService.Live.pipe(Layer.provide(layerWorkerSqlClient(input.bibleDatabase)));
  const dependencies = Layer.mergeAll(
    bible,
    writings,
    topics,
    writingsLibrary,
    layerLocalProcedureRuntime(input.runtime),
  );

  const handlers = BibleProcedureHandlers.pipe(Layer.provide(dependencies));

  return RpcServer.layer(BibleProcedureGroup).pipe(
    Layer.provide(handlers),
    Layer.provide(RpcServer.layerProtocolWorkerRunner),
    Layer.provide(BrowserWorkerRunner.layerMessagePort(input.port)),
  );
};
