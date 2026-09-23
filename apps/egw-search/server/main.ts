/* oxlint-disable effect/noNullish -- the HTTP wire shape is JSON: an absent refcode, rank or deep link is encoded as `null`, exactly as `./api.ts` declares it. */
/* oxlint-disable effect/noTernary -- one branch on §9.6's two-case vector status, rendered into a label. */
/* oxlint-disable effect/noInlineProvide -- `verifiedVectorIndex` provides the byte source at its own boundary so the 265 MB artifact is read once and the gate's decision is passed down as a value; this is the shape `packages/cli/src/commands/egw/search-layer.ts` uses for the same reason. */
/* oxlint-disable effect/noGlobals -- the corpus paths are needed to *construct* the layers below, before any Effect runs; reading them through `Config` would force a `Layer.unwrap` whose outputs the type checker then cannot see (which is what made the shared SqlClient leak out as an unmet requirement). */

/**
 * Search server for the standalone EGW searcher.
 *
 * It answers through the canonical hybrid `SearchService` — the same §9
 * composition the CLI uses — so the lexical leg, the vector leg and the RRF
 * fusion behave here exactly as they do at the terminal. Nothing in this
 * module re-implements retrieval; it composes the service, adds surrounding
 * paragraphs, and serves the result.
 *
 * Every corpus path comes from `BIBLE_CORPUS_DIR` (default `~/.bible`) rather
 * than being hardcoded, because the deployed host mounts them on a volume.
 * The vector index and the embedder are both optional by §9.6: if either is
 * absent, search degrades to lexical-only and the result says so.
 *
 * **No wiki.** This surface is a search box over the writings, and it has no
 * topic pages to pin: the client never rendered the `topics` field it was
 * sent, and the deployed volume carries no `topics.db`, so every query logged
 * a wiki degradation to produce an empty array nobody read. Topics are an
 * application's concern now rather than the search service's, and this
 * application's answer is that it has none.
 */

import { ActorHost, HttpServer } from 'effect-frame/actor';
import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { BunHttpServer, BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';
import {
  Etag,
  FetchHttpClient,
  HttpMiddleware,
  HttpPlatform,
  HttpRouter,
  HttpServer as PlatformHttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/unstable/http';
import { HttpApiBuilder } from 'effect/unstable/httpapi';
import { SqlClient } from 'effect/unstable/sql';
import { OtlpSerialization, OtlpTracer } from 'effect/unstable/observability';

import { EGWParagraphDatabase } from '@bible/core/egw-db';
import {
  layerFileVectorIndexBytes,
  loadVectorIndex,
  QueryEmbedder,
  ResolvedVectorIndex,
  SearchCorpusSources,
  SearchService,
  VectorIndexBytes,
} from '@bible/core/search';
import { layerBunEmbedder } from '@bible/core/search/bun';

import { actorPrefix } from '../src/contract.js';
import { NO_SELECTION, SearchApi } from './api.js';
import { SiteLive } from './document.js';
import { runSearch, SearchLive } from './search.js';
import { EgwSyncLive } from './sync.js';
import { InspectRouteLive } from './inspect.js';
import { PoliciesLive } from './policies.js';
import type { WarmRequest, WarmResult } from './warm-corpus.worker.js';

const PORT = Number(process.env['PORT'] ?? 3101);
const DEFAULT_LIMIT = 40;
const DEFAULT_CONTEXT = 1;

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/** The JSON wire's defaults, applied where the `HttpApi` leaves a field
 *  optional. `runSearch` in `./search.ts` takes the full request. */
const SearchGroupLive = HttpApiBuilder.group(SearchApi, 'search', (handlers) =>
  Effect.gen(function* () {
    // Resolved once, when the group is built, so a request carries no
    // requirement of its own out through the router.
    const services = yield* Effect.context<SearchService | SqlClient.SqlClient>();
    return handlers
      .handle('health', () => Effect.succeed({ ok: true }))
      .handle('query', ({ query: params }) =>
        runSearch({
          q: params.q,
          scope: params.scope ?? 'all',
          section: params.section ?? NO_SELECTION,
          type: params.type ?? NO_SELECTION,
          subtype: params.subtype ?? NO_SELECTION,
          excludeApparatus: params.noref === '1',
          limit: params.limit ?? DEFAULT_LIMIT,
          context: params.context ?? DEFAULT_CONTEXT,
        }).pipe(Effect.provideContext(services)),
      );
  }),
);

// ---------------------------------------------------------------------------
// Layer composition — the CLI's `installedSearchLayer`, rooted at a configured
// corpus directory instead of `~/.bible`.
// ---------------------------------------------------------------------------

/** Gate the index on the shipped parser before anything scans it, and hand the
 *  *parsed* result down so the 265 MB artifact is read exactly once per
 *  process. A refusal degrades to lexical-only, logged once at startup rather
 *  than per query. */
const verifiedVectorIndex = (
  filename: string,
): Layer.Layer<ResolvedVectorIndex | VectorIndexBytes> =>
  Layer.unwrap(
    Effect.gen(function* () {
      const source = layerFileVectorIndexBytes(filename).pipe(Layer.provide(BunServices.layer));
      const loaded = yield* loadVectorIndex.pipe(Effect.provide(source));
      if (loaded._tag !== 'index') {
        yield* Effect.logInfo('search.vectorIndex.refused').pipe(
          Effect.annotateLogs({ filename, reason: loaded.absence.reason }),
        );
      }
      return Layer.merge(ResolvedVectorIndex.layerOf(loaded), VectorIndexBytes.None);
    }),
  );

/** Where the corpus files live.
 *
 *  Read from the environment directly rather than through `Config` inside a
 *  `Layer.unwrap`: the paths are needed to *construct* the layers, and a layer
 *  built inside an unwrap hides its own outputs from the type checker, which
 *  is what made the shared SQL client leak back out as an unmet requirement.
 *  A plain string keeps the composition below flat and statically checkable.
 *
 *  The deployed host sets `BIBLE_CORPUS_DIR` to its volume mount. */
const CORPUS_ROOT = process.env['BIBLE_CORPUS_DIR'] ?? `${process.env['HOME'] ?? '.'}/.bible`;
const at = (file: string): string => `${CORPUS_ROOT}/${file}`;

/** One SQL client over the writings file, built once and shared: the search
 *  sources read `paragraphs_fts` through it, and the context lookup reads the
 *  neighbouring paragraphs through the same connection rather than opening a
 *  second one against a 4.5 GB file.
 *
 *  Tuned for a read-only corpus far larger than memory — see `TunedSqlLive`. */
const SqlLive = SqliteBun.layer({ filename: at('egw-paragraphs.db') });

/** How much page cache SQLite may hold, as a negative `cache_size` (KiB rather
 *  than pages, so it does not silently change meaning with `page_size`).
 *
 *  SQLite's default is 2,000 *pages* — 8 MB against a 4.3 GB database. Measured
 *  in production, the first hybrid query after a deploy spent 40,441 ms of its
 *  43,378 ms in the bodies join, fetching **sixty rows**: 674 ms per row, which
 *  is not computation but sixty uncached random seeks into the file. An 8 MB
 *  cache cannot hold enough of a 4.3 GB b-tree for one query's lookups to help
 *  the next.
 *
 *  **4 GB on a 32 GB container** (`memory.max` = 32,000,000,000; `MemTotal` is
 *  322 GB on the host). 512 MB was the first tuning and is too small by the
 *  one measurement that matters: `paragraphs_fts_data`, the posting lists every
 *  lexical query reads, is **421 MB by itself**. A 512 MB cache holds the
 *  postings *or* the b-tree pages the bodies join seeks through, not both, so
 *  the warm-up's own passes evicted each other and the first real query still
 *  paid full cold cost — `lexicalMs: 12640` for `god` against 425 ms on the
 *  very next identical request.
 *
 *  4 GB holds the whole 421 MB of postings plus room for the hot part of the
 *  3.6 GB `paragraphs` b-tree, and still leaves 28 GB of the limit for the
 *  process, the embedding model and the vector index. The corpus is read-only
 *  here, so cached pages are never invalidated by a write, and the cache is an
 *  upper bound rather than an allocation: SQLite grows into it on demand.
 *
 *  Worth knowing before tuning this further: the corpus lives on a *network*
 *  volume (`/dev/zd2144` mounted at `/data`), not local disk. Reading the
 *  421 MB of postings cold takes ~43 s, about 10 MB/s, which is why a cold
 *  cache is so expensive here and why holding it matters more than it would on
 *  an instance-local SSD. */
const PAGE_CACHE_KIB = 4 * 1024 * 1024;

/** How much of the file SQLite may memory-map.
 *
 *  Sized past the 4.3 GB database so the whole file is mappable. This is not an
 *  allocation: the OS pages it in on demand and evicts under pressure. What it
 *  removes is the copy through SQLite's own cache on every read, which is what
 *  makes a random seek into a large file expensive twice over. */
const MMAP_BYTES = 8 * 1024 * 1024 * 1024;

/** Apply the pragmas to the one connection everything reads through.
 *
 *  A layer rather than client options because `SqliteClientConfig` has no
 *  pragma field, and a layer rather than a first-query concern because these
 *  must be set before anything reads: `cache_size` and `mmap_size` are
 *  per-connection, and a query that runs first simply runs untuned.
 *
 *  `Layer.provideMerge` keeps `SqlClient` published for everything downstream —
 *  this layer adds a side effect to the client, it does not replace it.
 *
 *  Failures are logged, not fatal. A pragma that will not apply costs latency,
 *  and refusing to serve search over a tuning setting would be a worse outcome
 *  than serving it slowly. */
const TunedSqlLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql.unsafe(`PRAGMA cache_size = -${String(PAGE_CACHE_KIB)}`);
    yield* sql.unsafe(`PRAGMA mmap_size = ${String(MMAP_BYTES)}`);
    yield* Effect.log(
      'search.sqlite.tuned',
      `cacheKiB=${String(PAGE_CACHE_KIB)} mmapBytes=${String(MMAP_BYTES)}`,
    );
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning('search.sqlite.tune_failed', `cause=${String(cause)}`),
    ),
  ),
).pipe(Layer.provideMerge(SqlLive));

const CorpusSources = Layer.effect(
  SearchCorpusSources,
  Effect.gen(function* () {
    return SearchCorpusSources.of({
      _tag: 'wired',
      sources: {
        paragraphs: yield* EGWParagraphDatabase,
      },
    });
  }),
).pipe(
  Layer.provide(EGWParagraphDatabase.layerCore),
  Layer.provide(TunedSqlLive),
  Layer.provide(BunServices.layer),
  // No `paragraphs_fts` means no lexical leg, and §9 has no degraded shape for
  // that. It is a defect, not an empty result set.
  Layer.orDie,
);

/** Load the embedding model at boot instead of on a reader's first search.
 *
 *  The model is memoized on first use by design — the CLI builds the embedder
 *  layer at startup and a reader who never searches should never pay for a
 *  300M-parameter model (see `layerTransformersEmbedder`). A long-lived server
 *  is the other case: it *will* be searched, and whoever arrives first should
 *  not be the one to wait. Measured on the deployed container, the first query
 *  after a deploy took ~49 s against ~0.5 s warm, and the model load is the
 *  bulk of it — the vector index is already resolved before the port opens.
 *
 *  Forked, so the port still opens immediately. A search arriving mid-load
 *  waits on the same memoized cell rather than starting a second load, so the
 *  worst case is what happens today and the common case is a warm model.
 *
 *  A failure here is logged and dropped: the load is retried on the next query
 *  (the memo stores successes only), and an embedder that cannot load is
 *  §9.6's lexical-only degradation, not a reason to refuse to serve. */
const WarmEmbedderLive: Layer.Layer<never, never, QueryEmbedder> = Layer.effectDiscard(
  Effect.gen(function* () {
    const embedder = yield* QueryEmbedder;
    yield* embedder.embedQuery('warm').pipe(
      Effect.andThen(Effect.log('search.embedder.warm', 'state=ready')),
      Effect.catchCause((cause) =>
        Effect.logWarning('search.embedder.warm_failed', `cause=${String(cause)}`),
      ),
      Effect.forkDetach,
    );
  }),
);

/** The embedder, built once.
 *
 *  Shared deliberately: the memo that makes the model load once lives *in* the
 *  service instance, so providing `layerBunEmbedder` separately to the search
 *  service and to the warm-up would build two of them, each with its own cell —
 *  and the warm-up would then load a model no query ever reads. */
const EmbedderLive = layerBunEmbedder;

/** The hybrid service, plus the SQL client the context lookup shares with it. */
/** Fault the corpus in before a reader does.
 *
 *  A container that has just started has nothing of the 4.5 GB database
 *  resident, and the first query pays for every page it touches. Measured in
 *  production right after a deploy: `god` took 7,176 ms against 1,031 ms once
 *  warm, and even a *gated* query — one that does nothing but count — spent
 *  531 ms in `lexicalMs`, because counting still walks a cold posting list.
 *
 *  The three statements below are chosen to touch what the three legs touch,
 *  in the order a query would:
 *
 *  1. `paragraphs_fts_data` (449 MB) is the posting lists every lexical query
 *     reads, including the selectivity probe.
 *  2. Ranked queries over the corpus's *common* terms make FTS5 score rather
 *     than merely count, which walks the index structures scoring uses and
 *     nothing else does. Several terms rather than one, because scoring cost is
 *     linear in the posting list and a selective term faults in almost none of
 *     what a common term needs — measured below.
 *  3. The join those rows come back through is the bodies leg, whose seeks are
 *     scattered across a 3.6 GB table — the part the page cache helps least and
 *     therefore the part most worth touching first.
 *
 *  **What this deliberately does not warm: the bodies rows themselves.** A
 *  semantic query's remaining cost is its `bodiesMs` — 2,099 ms of the 2,949 ms
 *  measured for "what happens at the close of probation" — and the obvious next
 *  move is to warm those rows too. It does not work, and the reason is
 *  structural rather than a tuning question.
 *
 *  Measured over six representative semantic queries: each touches ~53 distinct
 *  pages of `paragraphs`, their union is 318 pages against 321 if they were
 *  fully disjoint, and mean pairwise overlap is **0.4%**. Sixty hits scatter
 *  essentially at random over 768,919 leaf pages, so one query's rows tell you
 *  nothing about the next one's. Covering even 10% of the table would take
 *  ~1,451 warm queries, and the 512 MB cache tops out at 17% of it regardless.
 *
 *  So the lexical path is warmable — a term's posting list is one contiguous
 *  structure every query for that term reads — and the bodies path is not.
 *  Cutting `bodiesMs` needs fewer or cheaper seeks, not a warmer cache.
 *
 *  **On its own thread** (`./warm-corpus.worker.ts`). `bun:sqlite` runs a
 *  statement synchronously, so a forked fiber gives no concurrency: when this
 *  warm-up was a detached fiber on the server's connection, its ~69 s of reads
 *  held the one JS thread, the server bound its port only after the warm-up
 *  ended, and every deploy served 502 for that long. The worker opens its own
 *  read-only connection; the pages it pulls off the volume land in the OS page
 *  cache, which the server's `mmap` reads come from. The port opens at once. A
 *  reader who arrives mid-warm-up is not blocked, only unlucky, and pays the
 *  same cost they would have paid anyway.
 *
 *  Failures are logged, never fatal. Warming is an optimization; a corpus that
 *  cannot be warmed can still be searched. */
const WarmCorpusLive: Layer.Layer<never> = Layer.effectDiscard(
  Effect.callback<WarmResult>((resume) => {
    const worker = new Worker(new URL('./warm-corpus.worker.ts', import.meta.url));
    // One answer, then the thread ends; an interruption ends it too.
    worker.onmessage = (event: MessageEvent<WarmResult>) => {
      worker.terminate();
      resume(Effect.succeed(event.data));
    };
    // A thread that dies before it answers is a warm-up that failed.
    worker.onerror = (event) => {
      worker.terminate();
      resume(Effect.succeed({ _tag: 'Failed', message: event.message }));
    };
    const request: WarmRequest = { filename: at('egw-paragraphs.db'), mmapBytes: MMAP_BYTES };
    worker.postMessage(request);
    return Effect.sync(() => worker.terminate());
  }).pipe(
    Effect.flatMap((result) => {
      if (result._tag === 'Failed') {
        return Effect.logWarning('search.corpus.warm_failed', `cause=${result.message}`);
      }
      return Effect.log(
        'search.corpus.warm',
        `state=ready postingsMs=${String(result.postingsMs)} queryMs=${String(result.queryMs)}`,
      );
    }),
    Effect.catchCause((cause) =>
      Effect.logWarning('search.corpus.warm_failed', `cause=${String(cause)}`),
    ),
    Effect.forkDetach,
  ),
);

const searchLayer = Layer.mergeAll(
  SearchService.Live.pipe(
    Layer.provide(CorpusSources),
    Layer.provide(verifiedVectorIndex(at('vectors.bvi'))),
    Layer.provide(BunServices.layer),
  ),
  WarmEmbedderLive,
  TunedSqlLive,
  // Its own connection on its own thread: it needs nothing from this merge.
  WarmCorpusLive,
).pipe(Layer.provideMerge(EmbedderLive));

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

// `searchLayer` publishes both the service the handler reads and the SQL
// client the context lookup reads through, so it is provided to the group —
// not to the API layer — or the client stays an unmet requirement and leaks
// out of `ApiLive` into the server's own context.
const GroupLive = SearchGroupLive.pipe(Layer.provide(searchLayer), Layer.provide(TunedSqlLive));

const ApiLive = HttpApiBuilder.layer(SearchApi).pipe(Layer.provide(GroupLive));

/** Where the built client lives: `index.js` and `styles.css`. The server
 *  writes the page document itself (`./document.ts`). */
const STATIC_ROOT = process.env['EGW_SEARCH_STATIC_DIR'] ?? `${import.meta.dir}/../dist`;

/** The actor transport the page reads through, mounted under `/actors`.
 *
 *  The host serves no actors — only the `Search` query — and it answers over
 *  the same `searchLayer` the JSON API does. The route strips the prefix and
 *  hands the raw web request to effect-frame's handler, which owns the wire
 *  (`POST /query`, and the actor verbs no contract here uses). */
const ActorsLive = ActorHost.layer({ implementations: [], queries: [SearchLive] }).pipe(
  Layer.provide(searchLayer),
  Layer.provide(TunedSqlLive),
  Layer.provide(PoliciesLive),
  // Every name the contract declares is in `PoliciesLive`; a miss is a bug in
  // that file, so the server refuses to start rather than serve without it.
  Layer.orDie,
);

const ActorsRouteLive = HttpRouter.use((router) =>
  Effect.gen(function* () {
    // No accounts and no sessions: every request is anonymous, and that is a
    // written line rather than a default.
    const handle = yield* HttpServer.make({ principal: HttpServer.anonymous });
    yield* router.add('*', `${actorPrefix}/*`, (request) =>
      Effect.gen(function* () {
        const web = yield* HttpServerRequest.toWeb(request);
        const url = new URL(web.url);
        url.pathname = url.pathname.slice(actorPrefix.length);
        const response = yield* handle(new Request(url, web));
        return HttpServerResponse.fromWeb(response);
      }),
    );
  }),
).pipe(Layer.provide(ActorsLive));

/** The built client and the streamed page document. The document renders
 *  its queries through the same in-process host the actor route serves. */
const SiteRouteLive = SiteLive({ staticRoot: STATIC_ROOT }).pipe(Layer.provide(ActorsLive));

/** Live Frame inspection for development; empty unless `EGW_INSPECT=1`. */
const InspectLive = InspectRouteLive(process.env);

const RouterLive = Layer.mergeAll(SiteRouteLive, ActorsRouteLive, ApiLive, InspectLive);

const HttpLive = Layer.unwrap(
  HttpRouter.toHttpEffect(RouterLive).pipe(
    Effect.map((httpApp) =>
      PlatformHttpServer.serve(HttpMiddleware.logger)(httpApp).pipe(
        PlatformHttpServer.withLogAddress,
        Layer.provide(BunHttpServer.layer({ port: PORT })),
      ),
    ),
  ),
);

/** The weekly corpus sync, over the *same* `TunedSqlLive` the handlers read
 *  through. Merged into the launch rather than into `RouterLive` because it
 *  serves no route: it is a background fiber that happens to need the same
 *  database connection. See `./sync.ts` for why it must not open its own. */
const SyncLive = EgwSyncLive.pipe(Layer.provide(TunedSqlLive));

/** Export spans over OTLP, when the deployment says where to.
 *
 *  `layerFromConfig` reads the standard OpenTelemetry environment —
 *  `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`,
 *  `OTEL_TRACES_EXPORTER`, `OTEL_SDK_DISABLED` — and returns a no-op flusher
 *  when no endpoint is set, so this is inert locally and needs no gate of our
 *  own. Railway injects the endpoint and headers for its own trace ingest, so
 *  in production this wires itself up; pointing it at a different backend is a
 *  matter of overriding those variables and redeploying.
 *
 *  JSON rather than protobuf: Railway's receiver takes OTLP/HTTP, and the
 *  volume here is a handful of spans per query rather than a firehose worth
 *  encoding more tightly.
 *
 *  Traces only. Railway's ingest rejects OTLP metrics and logs, and this app's
 *  logs already go to the platform's log stream. */
const TracingLive = OtlpTracer.layerFromConfig({
  resource: { serviceName: 'egw-search' },
}).pipe(Layer.provide(OtlpSerialization.layerJson), Layer.provide(FetchHttpClient.layer));

const PlatformLive = Layer.mergeAll(
  SyncLive,
  TracingLive,
  Etag.layer,
  HttpPlatform.layer.pipe(Layer.provide(BunServices.layer)),
  // `BunServices` carries the FileSystem and Path the static server reads
  // `dist/` through, alongside the platform services the API already needed.
  BunServices.layer,
  // The router's own effect still carries the context lookup's `SqlClient`
  // requirement out through `toHttpEffect`, so the launch context supplies the
  // same client the handlers were built against.
  TunedSqlLive,
);

Layer.launch(HttpLive).pipe(Effect.provide(PlatformLive), BunRuntime.runMain);
