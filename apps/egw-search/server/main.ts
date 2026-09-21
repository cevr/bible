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

import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { BunHttpServer, BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect, Layer, Option } from 'effect';
import {
  Etag,
  FetchHttpClient,
  HttpMiddleware,
  HttpPlatform,
  HttpRouter,
  HttpServer,
  HttpStaticServer,
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
  SearchQuery,
  SearchService,
  VectorIndexBytes,
} from '@bible/core/search';
import { layerBunEmbedder } from '@bible/core/search/bun';
import type { CorpusFilter } from '@bible/core/writings';

import { NO_SELECTION, readerUrl, SearchApi, SearchFailed } from './api.js';
import { emptySurrounding, surroundingParagraphs } from './context.js';
import { EgwSyncLive } from './sync.js';

const PORT = Number(process.env['PORT'] ?? 3101);
const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;
const DEFAULT_CONTEXT = 1;
const MAX_CONTEXT = 3;

/** This surface never returns lookup apparatus.
 *
 *  A row like `TopIndex .Trouble, Troubles.61` is a see-also stub ("time of,
 *  See Time of Trouble"). It matches a topical query on almost every term in
 *  it, so the indexes rank *well* for exactly the queries this app is for and
 *  push the prose a reader came to read off the page.
 *
 *  This used to be a hardcoded set of ten book codes filtered off the
 *  *returned* page, which was the wrong end of the pipeline: the lexical leg
 *  fetches `SEARCH_CANDIDATE_LIMIT` rows, and for a one-word query like
 *  "sanctuary" thirteen of the first thirty were `TopIndex` stubs — so the
 *  search paid to retrieve them, ranked them, then threw them away and
 *  returned three results. Now that `books` carries the library's own `type`,
 *  the exclusion is a `WHERE` clause instead: the apparatus never enters the
 *  candidate pool, and the thirty rows are thirty rows of prose.
 *
 *  Forced on rather than defaulted, because it is a property of this surface —
 *  the CLI and the desktop reader both have uses for the indexes; a search box
 *  over the writings does not. A reader who wants them can still select
 *  `type=dictionary` explicitly, which names them positively. */
const NEVER_APPARATUS = true;

const clamp = (raw: number | undefined, fallback: number, max: number): number => {
  if (raw === undefined || !Number.isFinite(raw) || raw < 0) return fallback;
  return Math.min(Math.trunc(raw), max);
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

const SearchGroupLive = HttpApiBuilder.group(SearchApi, 'search', (handlers) =>
  Effect.gen(function* () {
    const search = yield* SearchService;

    return handlers
      .handle('health', () => Effect.succeed({ ok: true }))
      .handle('query', ({ query: params }) =>
        Effect.gen(function* () {
          const text = params.q.trim();
          const scope = params.scope ?? 'all';
          const filter: CorpusFilter = {
            // Already split by the endpoint's `SignedFromStrings` transform.
            section: params.section ?? NO_SELECTION,
            type: params.type ?? NO_SELECTION,
            subtype: params.subtype ?? NO_SELECTION,
            // Always on for this surface (see `NEVER_APPARATUS`); `noref` is
            // kept on the wire so a link can still say so explicitly.
            excludeApparatus: NEVER_APPARATUS,
          };
          if (text === '') return { hits: [], scope, vector: 'idle', nonSelective: false };

          const limit = clamp(params.limit, DEFAULT_LIMIT, MAX_LIMIT);
          const radius = clamp(params.context, DEFAULT_CONTEXT, MAX_CONTEXT);

          const result = yield* search.query(
            SearchQuery.make({
              text,
              // `'all'` is passed as `none` rather than as the literal: the
              // service treats an absent scope as unfiltered, and sending
              // `some('all')` would be a second spelling of the same thing.
              scope: scope === 'all' ? Option.none() : Option.some(scope),
              bookCode: Option.none(),
              filter,
              limit: Option.some(limit),
            }),
          );

          const paragraphs = result.paragraphs.slice(0, limit);

          // One batched lookup for the whole page's context.
          //
          // Keyed on `rawParaId`, not `paragraphId`: the latter is §9.4's
          // fusion identity (`"RR:1978.1544"` — book code, colon, para id) and
          // matches nothing in the `para_id` column, which holds the bare
          // `"1978.1544"`. A hit without a `rawParaId` has no addressable
          // paragraph at all, so it simply contributes no anchor.
          const anchors = paragraphs.flatMap((hit) =>
            Option.match(hit.rawParaId, { onNone: () => [], onSome: (id) => [id] }),
          );
          // Timed separately from the search itself. `search.timing` covers
          // the three retrieval legs and nothing else, and a query whose
          // `totalMs` was 981 inside a 43-second HTTP span proved the handler
          // can be the cost — so the handler's own read is measured too rather
          // than inferred from the difference.
          const contextAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
          const context = yield* surroundingParagraphs(anchors, radius).pipe(
            Effect.withSpan('search.context', { attributes: { anchors: anchors.length } }),
          );
          yield* Effect.logInfo('search.context.timing').pipe(
            Effect.annotateLogs({
              anchors: anchors.length,
              radius,
              contextMs: (yield* Effect.clockWith((clock) => clock.currentTimeMillis)) - contextAt,
            }),
          );

          return {
            hits: paragraphs.map((hit) => {
              const around = Option.match(hit.rawParaId, {
                onNone: () => emptySurrounding,
                onSome: (id) => context.get(id) ?? emptySurrounding,
              });
              return {
                refcode: Option.getOrNull(hit.refcode),
                bookCode: hit.bookCode,
                bookTitle: hit.bookTitle,
                author: hit.author,
                text: hit.snippet,
                lexicalRank: Option.getOrNull(hit.lexicalRank),
                vectorRank: Option.getOrNull(hit.vectorRank),
                url: Option.match(hit.rawParaId, { onNone: () => null, onSome: readerUrl }),
                before: around.before,
                after: around.after,
              };
            }),
            scope,
            vector: result.vector._tag === 'ran' ? 'hybrid' : `lexical — ${result.vector.reason}`,
            nonSelective: result.nonSelective,
          };
        }).pipe(
          Effect.tapCause((cause) =>
            Effect.logError('search.failed').pipe(Effect.annotateLogs({ cause: String(cause) })),
          ),
          Effect.mapError(() => SearchFailed.make({ message: 'search failed' })),
        ),
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
 *  Forked and detached, exactly as `WarmEmbedderLive` is: the port must open
 *  immediately. A reader who arrives mid-warm-up is not blocked, only unlucky,
 *  and pays the same cost they would have paid anyway.
 *
 *  Failures are logged, never fatal. Warming is an optimization; a corpus that
 *  cannot be warmed can still be searched. */
/** The terms whose posting lists the warm-up scores.
 *
 *  Frequent in this corpus and *ungated* — a term the selectivity gate refuses
 *  is never scored by a query, so warming its pages would buy nothing. Their
 *  match counts, measured: `god` 570,900, `lord` 299,913, `christ` 283,120,
 *  `jesus` 141,862, `love` 96,205, `heaven` 91,727, `sabbath` 68,411.
 *
 *  Literals, and only ever literals: they are interpolated into SQL below. */
const WARM_TERMS: readonly string[] = [
  'god',
  'lord',
  'jesus',
  'christ',
  'love',
  'heaven',
  'sabbath',
];

const WarmCorpusLive: Layer.Layer<never, never, SqlClient.SqlClient> = Layer.effectDiscard(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* Effect.gen(function* () {
      const startedAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
      // The posting lists, whole. `count(*)` over the shadow table reads every
      // page of it without materializing rows.
      yield* sql.unsafe(`SELECT count(*) FROM paragraphs_fts_data`);
      const postingsAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
      // Real ranked queries: scoring, the bodies join and the books join.
      //
      // Several terms, not one, and *common* ones. A first version warmed
      // `sanctuary` alone and did not help: `god` still took 7,124 ms on the
      // first query against 961 ms on the second. Scoring cost is linear in a
      // term's posting list, and `god` (570,900 rows) touches 34x what
      // `sanctuary` (16,765) does — so warming a selective term faults in
      // almost none of the pages a common one needs.
      //
      // These are the frequent ungated terms of this corpus, which is both
      // where the cost concentrates and what readers actually type. Gated
      // stopwords are deliberately absent: the selectivity gate means no query
      // ever scores them, so their pages are never wanted.
      // **The `ORDER BY` must match `searchScoredParagraphs`'s.** It orders by
      // `bm25(paragraphs_fts)` rather than the bare `rank`, and the two are the
      // same ranking by *different code paths*: `rank` plans as FTS5's internal
      // `VIRTUAL TABLE INDEX 32:M3` rank-merge, `bm25()` as `INDEX 0:M3` plus a
      // bounded top-N heap. They touch different index structures, so a
      // warm-up ordered the other way faults in pages no query will read and
      // leaves the ones it will read cold — it warms the wrong thing while
      // reporting success. This clause tracks the live statement; if that one
      // changes, change this one with it.
      //
      // Interpolated rather than bound because `sql.unsafe` takes no
      // parameters. Safe only because these are literals in this file: nothing
      // here is ever derived from a request, and a term must never become so.
      for (const term of WARM_TERMS) {
        yield* sql.unsafe(`
          SELECT p.ref_code, p.nodes_json
          FROM paragraphs_fts fts
          JOIN paragraphs p ON p.rowid = fts.rowid
          JOIN books b ON p.book_id = b.book_id
          WHERE paragraphs_fts MATCH '${term}'
          ORDER BY bm25(paragraphs_fts)
          LIMIT 60
        `);
      }
      const doneAt = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
      yield* Effect.log(
        'search.corpus.warm',
        `state=ready postingsMs=${String(postingsAt - startedAt)} queryMs=${String(doneAt - postingsAt)}`,
      );
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning('search.corpus.warm_failed', `cause=${String(cause)}`),
      ),
      Effect.forkDetach,
    );
  }),
);

const searchLayer = Layer.mergeAll(
  SearchService.Live.pipe(
    Layer.provide(CorpusSources),
    Layer.provide(verifiedVectorIndex(at('vectors.bvi'))),
    Layer.provide(BunServices.layer),
  ),
  WarmEmbedderLive,
  // After `TunedSqlLive` in the merge so the pragmas are applied to the
  // connection before the warm-up reads through it: warming an 8 MB cache
  // would fault pages in and immediately evict them.
  TunedSqlLive,
  WarmCorpusLive.pipe(Layer.provide(TunedSqlLive)),
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

/** The built client, served from the same router as the API.
 *
 *  In development vite owns the UI on its own port and proxies `/api` here, so
 *  this layer is dead weight; in production there is no vite, and without it
 *  the root would 404 while `/api/search` answered perfectly. `spa: true`
 *  sends unknown paths to `index.html` so a deep link is the client's to
 *  route, not a 404 from the file system.
 *
 *  The API is merged *after* the static server so an explicitly declared
 *  route always wins over a file that happens to share its path. */
const STATIC_ROOT = process.env['EGW_SEARCH_STATIC_DIR'] ?? `${import.meta.dir}/../dist`;

const StaticLive = HttpStaticServer.layer({
  root: STATIC_ROOT,
  spa: true,
  index: 'index.html',
});

const RouterLive = Layer.mergeAll(StaticLive, ApiLive);

const HttpLive = Layer.unwrap(
  HttpRouter.toHttpEffect(RouterLive).pipe(
    Effect.map((httpApp) =>
      HttpServer.serve(HttpMiddleware.logger)(httpApp).pipe(
        HttpServer.withLogAddress,
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
