import * as BrowserWorkerRunner from '@effect/platform-browser/BrowserWorkerRunner';
import { BibleDatabase } from '@bible/core/bible-db';
import { BibleService } from '@bible/core/bible/service';
import {
  CONTENT_MANIFEST_PROXY_PATH,
  ContentUpdate,
  layerHttpContentManifestAt,
} from '@bible/core/content-update';
import {
  CorpusSupply,
  layerWritingsLibraryRuntime,
  type TopicsArtifactInstaller,
  type TopicsArtifactRecipe,
} from '@bible/core/corpus-supply';
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
import { SearchCorpusSources, SearchService, VectorIndexBytes } from '@bible/core/search';
import { layerBrowserEmbedder } from '@bible/core/search/browser';
import {
  layerReloadableWiki,
  layerReloadOnActivation,
  LookupService,
  WikiService,
  WikiSectionSources,
} from '@bible/core/wiki';
import { Effect, Layer, Option } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import * as RpcServer from 'effect/unstable/rpc/RpcServer';

import type { SqliteDatabase } from './sqlite-database.js';
import { layerHttpWritingsAssetSource } from './writings-http-source.js';
import { layerWorkerSqlClient } from './worker-sql-client.js';

export interface ProcedureServerInput {
  readonly port: MessagePort;
  readonly bibleDatabase: SqliteDatabase;
  readonly writingsDatabase: SqliteDatabase;
  /** The topics artifact's active generation, **read on every wiki rebuild**
   *  rather than captured once.
   *
   *  `None` when none is installed — the §3.5 steady state until the first
   *  content release, and a state the wiki degrades around rather than fails
   *  on. A thunk because that answer changes: §3.6 can install the first
   *  artifact into a running worker, and a worker that had snapshotted `None`
   *  at startup went on serving catalog-only pages until the tab was reloaded
   *  (round-3 F3, the browser's dialect of it). */
  readonly topicsDatabase: () => Option.Option<SqliteDatabase>;
  readonly writingsFetch: (url: string) => Promise<Response>;
  /** `None` when no vector index is installed — the §9.6 steady state on every
   *  browser that has not fetched the optional artifact. Hybrid search degrades
   *  to lexical-only around it and says so on the result, rather than failing. */
  readonly vectorIndex: Option.Option<ArrayBuffer>;
  /** The topics File Corpus this worker's storage owns — recipe and installer,
   *  over its OPFS generations and its IndexedDB registry.
   *
   *  §3.6's install runs through `CorpusSupply.installFrom`, which dispatches
   *  on the corpus name to the artifact registered under it. The supply built
   *  here was wired with the writings source alone, so `topics` was registered
   *  nowhere in it: accepting an offer resolved successfully, reported an
   *  activation, and installed nothing (round-4 F1). The layer is passed in
   *  rather than built here because the store it wraps — the OPFS families and
   *  the registry — is created once at worker startup and is also what the
   *  reader reads through; two of them would be two active generations. */
  readonly topicsArtifacts: Layer.Layer<TopicsArtifactInstaller | TopicsArtifactRecipe>;
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
  // Both corpora this worker can install into: writings, whose source is an
  // HTTP asset, and topics, whose artifact §3.6 replaces at runtime. One supply
  // rather than two, because `installFrom` resolves the corpus through the
  // registry a supply was built with — a second supply would be a second
  // registry, and the one the update reached would not be the one the reader
  // reads from.
  const corpusSupply = CorpusSupply.layer.pipe(
    Layer.provide(writingsSource),
    Layer.provide(writingsDatabase),
    Layer.provide(input.topicsArtifacts),
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
  const wiki = layerReloadableWiki(() =>
    Option.match(input.topicsDatabase(), {
      onNone: () => WikiService.Absent,
      onSome: (database) => WikiService.Live.pipe(Layer.provide(layerWorkerSqlClient(database))),
    }),
  ).pipe(Layer.provide(topics), Layer.provide(sectionSources));
  // The study seam (§8.1), over the same two worker databases. Composed inside
  // the worker exactly as the wiki page is, so `v1.study.verse.get` costs one
  // MessagePort round trip however many queries its five sections take.
  const study = StudyService.Live.pipe(
    Layer.provide(bibleDatabase),
    Layer.provide(EGWCommentaryService.Live.pipe(Layer.provide(writingsDatabase))),
  );
  // Select-to-lookup (§7). The same two dependencies the wiki itself takes —
  // the artifact for the topic group, the four section sources for the rest —
  // so a worker that can compose a topic page can resolve a selection with no
  // second wiring to keep in step.
  const lookup = LookupService.Live.pipe(Layer.provide(wiki), Layer.provide(sectionSources));
  // Hybrid search (§9), over the two corpora it reads: `paragraphs_fts` for the
  // lexical leg, the wiki for the pinned topics group. Both are already open in
  // this worker, so search adds a service rather than a second set of handles.
  const searchSources = Layer.effect(
    SearchCorpusSources,
    Effect.gen(function* () {
      return SearchCorpusSources.of({
        _tag: 'wired' as const,
        sources: { paragraphs: yield* EGWParagraphDatabase },
      });
    }),
  ).pipe(Layer.provide(writingsDatabase), Layer.provide(wiki));
  const search = SearchService.Live.pipe(
    Layer.provide(searchSources),
    Layer.provide(
      Option.match(input.vectorIndex, {
        onNone: () => VectorIndexBytes.None,
        onSome: (bytes) => VectorIndexBytes.layerOf(bytes),
      }),
    ),
    // The WebGPU adapter. §9.5 rules the WASM fallback out as a query path, so a
    // browser without WebGPU declines here and the result carries §9.6's
    // `embedder` absence — lexical-only, typed, never a crash.
    Layer.provide(layerBrowserEmbedder),
  );
  // §3.6 in the browser: the same portable policy the CLI and Electron main
  // run, pointed at the server's same-origin proxy instead of the release host
  // — a worker cannot reach GitHub directly (no CORS), and the proxy route is
  // the identical shape the three artifact proxies already use. Only the
  // address differs; the decision is `decideUpdate`'s on every host.
  const content = ContentUpdate.Live.pipe(
    Layer.provide(corpusSupply),
    Layer.provide(layerHttpContentManifestAt(CONTENT_MANIFEST_PROXY_PATH)),
    Layer.provide(FetchHttpClient.layer),
    // The same join Electron main makes, over the same two tags: an activation
    // rebuilds the wiki, so a first install reaches this tab's reader without a
    // page reload.
    Layer.provide(layerReloadOnActivation.pipe(Layer.provide(wiki))),
  );
  const dependencies = Layer.mergeAll(
    bible,
    writings,
    topics,
    wiki,
    lookup,
    study,
    search,
    content,
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
