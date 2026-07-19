import * as BrowserWorkerRunner from '@effect/platform-browser/BrowserWorkerRunner';
import { BibleDatabase } from '@bible/core/bible-db';
import { BibleService } from '@bible/core/bible/service';
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
import { layerWorkerSqlClient } from './worker-sql-client.js';

export interface ProcedureServerInput {
  readonly port: MessagePort;
  readonly bibleDatabase: SqliteDatabase;
  readonly writingsDatabase: SqliteDatabase;
  readonly runtime: LocalProcedureRuntimeOptions;
}

export const layerProcedureServer = (input: ProcedureServerInput) => {
  const bible = BibleService.Live.pipe(
    Layer.provide(BibleDatabase.layer),
    Layer.provide(layerWorkerSqlClient(input.bibleDatabase)),
  );
  const writings = WritingsService.Live.pipe(
    Layer.provide(EGWParagraphDatabase.layerCore),
    Layer.provide(layerWorkerSqlClient(input.writingsDatabase)),
  );
  const topics = TopicService.Live.pipe(Layer.provide(layerWorkerSqlClient(input.bibleDatabase)));
  const dependencies = Layer.mergeAll(
    bible,
    writings,
    topics,
    layerLocalProcedureRuntime(input.runtime),
  );

  const handlers = BibleProcedureHandlers.pipe(Layer.provide(dependencies));

  return RpcServer.layer(BibleProcedureGroup).pipe(
    Layer.provide(handlers),
    Layer.provide(RpcServer.layerProtocolWorkerRunner),
    Layer.provide(BrowserWorkerRunner.layerMessagePort(input.port)),
  );
};
