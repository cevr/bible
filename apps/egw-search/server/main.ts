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
import { WikiService } from '@bible/core/wiki';
import { layerBunWithCatalog } from '@bible/core/wiki/bun';

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
          if (text === '') return { hits: [], topics: [], scope, vector: 'idle' };

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
          const context = yield* surroundingParagraphs(anchors, radius);

          return {
            hits: paragraphs.map((hit) => {
              const around = Option.match(hit.rawParaId, {
                onNone: () => emptySurrounding,
                onSome: (id) => context.get(id) ?? emptySurrounding,
              });
              return {
                refcode: hit.refcode,
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
            topics: result.topics.map((topic) => topic.title),
            scope,
            vector: result.vector._tag === 'ran' ? 'hybrid' : `lexical — ${result.vector.reason}`,
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
 *  second one against a 4.5 GB file. */
const SqlLive = SqliteBun.layer({ filename: at('egw-paragraphs.db') });

const CorpusSources = Layer.effect(
  SearchCorpusSources,
  Effect.gen(function* () {
    return SearchCorpusSources.of({
      _tag: 'wired',
      sources: {
        paragraphs: yield* EGWParagraphDatabase,
        wiki: yield* WikiService,
      },
    });
  }),
).pipe(
  Layer.provide(EGWParagraphDatabase.layerCore),
  Layer.provide(SqlLive),
  Layer.provide(
    layerBunWithCatalog({
      topics: at('topics.db'),
      bible: at('bible.db'),
      writings: at('egw-paragraphs.db'),
    }),
  ),
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
const searchLayer = Layer.mergeAll(
  SearchService.Live.pipe(
    Layer.provide(CorpusSources),
    Layer.provide(verifiedVectorIndex(at('vectors.bvi'))),
    Layer.provide(BunServices.layer),
  ),
  WarmEmbedderLive,
  SqlLive,
).pipe(Layer.provideMerge(EmbedderLive));

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

// `searchLayer` publishes both the service the handler reads and the SQL
// client the context lookup reads through, so it is provided to the group —
// not to the API layer — or the client stays an unmet requirement and leaks
// out of `ApiLive` into the server's own context.
const GroupLive = SearchGroupLive.pipe(Layer.provide(searchLayer), Layer.provide(SqlLive));

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

/** The weekly corpus sync, over the *same* `SqlLive` the handlers read
 *  through. Merged into the launch rather than into `RouterLive` because it
 *  serves no route: it is a background fiber that happens to need the same
 *  database connection. See `./sync.ts` for why it must not open its own. */
const SyncLive = EgwSyncLive.pipe(Layer.provide(SqlLive));

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
  SqlLive,
);

Layer.launch(HttpLive).pipe(Effect.provide(PlatformLive), BunRuntime.runMain);
