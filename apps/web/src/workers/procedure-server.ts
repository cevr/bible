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
import { EGWCommentaryService } from '@bible/core/egw-commentary';
import { StudyService } from '@bible/core/study';
import { WikiService, WikiSectionSources } from '@bible/core/wiki';
import { Layer, Option } from 'effect';
import * as RpcServer from 'effect/unstable/rpc/RpcServer';

import type { SqliteDatabase } from './sqlite-database.js';
import { layerHttpWritingsAssetSource } from './writings-http-source.js';
import { layerWorkerSqlClient } from './worker-sql-client.js';

export interface ProcedureServerInput {
  readonly port: MessagePort;
  readonly bibleDatabase: SqliteDatabase;
  readonly writingsDatabase: SqliteDatabase;
  /** `None` when no topics artifact is installed — the §3.5 steady state until
   *  the first content release, and a state the wiki degrades around rather
   *  than fails on. */
  readonly topicsDatabase: Option.Option<SqliteDatabase>;
  readonly writingsFetch: (url: string) => Promise<Response>;
  readonly runtime: LocalProcedureRuntimeOptions;
}

export const layerProcedureServer = (input: ProcedureServerInput) => {
  const writingsDatabase = EGWParagraphDatabase.layerCore.pipe(
    Layer.provide(layerWorkerSqlClient(input.writingsDatabase)),
  );
  const bibleDatabase = BibleDatabase.layer.pipe(
    Layer.provide(layerWorkerSqlClient(input.bibleDatabase)),
  );
  const bible = BibleService.Live.pipe(Layer.provide(bibleDatabase));
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
  // The four §6 section sources the composer reads, wired from the same three
  // worker databases the rest of the server already holds. Because the page is
  // composed *inside* the worker, `v1.wiki.topic.get` costs one MessagePort
  // round trip no matter how many queries the six sections take.
  // Required by `WikiService.Live`, not optional: a worker that forgot this
  // would otherwise serve every topic page with a silently empty lineup. A
  // corpus that will not open still provides the tag — as `NotWired`, so the
  // page carries `sections-not-wired` rather than six unexplained empties.
  const sectionSources: Layer.Layer<WikiSectionSources> = WikiSectionSources.Live.pipe(
    Layer.provide(topics),
    Layer.provide(bibleDatabase),
    Layer.provide(writings),
    Layer.provide(EGWCommentaryService.Live.pipe(Layer.provide(writingsDatabase))),
    // Only corpora that will not open degrade. A blanket cause catch here also
    // swallowed defects and interruption, so a worker-side construction fault
    // reached the page as `sections-not-wired` and looked like a missing
    // library. The shared combinator draws that line for all three hosts.
    WikiSectionSources.NotWiredOnCorpusAbsence,
    Layer.orDie,
  );
  // Same `WikiService` the CLI resolves, over the worker's own SQL client: an
  // installed artifact reads through `Live`, an absent one degrades to
  // catalog-only pages through `Absent`. Both compose the identical lineup.
  const wiki = Option.match(input.topicsDatabase, {
    onNone: () => WikiService.Absent,
    onSome: (database) => WikiService.Live.pipe(Layer.provide(layerWorkerSqlClient(database))),
  }).pipe(Layer.provide(topics), Layer.provide(sectionSources));
  // The study seam (§8.1), over the same two worker databases. Composed inside
  // the worker exactly as the wiki page is, so `v1.study.verse.get` costs one
  // MessagePort round trip however many queries its five sections take.
  const study = StudyService.Live.pipe(
    Layer.provide(bibleDatabase),
    Layer.provide(EGWCommentaryService.Live.pipe(Layer.provide(writingsDatabase))),
  );
  const dependencies = Layer.mergeAll(
    bible,
    writings,
    topics,
    wiki,
    study,
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
