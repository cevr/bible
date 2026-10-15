/**
 * EGW search on a Cloudflare Worker.
 *
 * The same `SearchApi` the Bun server answers (`../search-api.ts`), over the
 * same canonical `SearchService`, with each host capability swapped for its
 * Cloudflare equivalent:
 *
 * | Bun server (`../main.ts`)       | Worker                                  |
 * | ------------------------------- | --------------------------------------- |
 * | `egw-paragraphs.db` on a volume | D1 (`Corpus`), read through `D1Client`  |
 * | `vectors.bvi` scanned in memory | Vectorize (`./vectorize.ts`)            |
 * | ONNX EmbeddingGemma in process  | Workers AI (`./workers-ai.ts`)          |
 * | `HttpStaticServer` over `dist/` | the Worker's static assets              |
 *
 * Only `/api/*` and `/health` reach the Worker; every other path is an asset,
 * and an unknown one is the single-page app's `index.html`, as `spa: true`
 * makes it on the Bun server.
 *
 * The vector leg is ready from the first request: nothing is read into
 * memory, so `/health` always says `ready`.
 *
 * Where `prod` is served from follows `SERVED_FROM` (`./site.ts`). Any other
 * stage is a throwaway copy on a generated `workers.dev` name over the same
 * shared corpus (`./resources.ts`).
 */
import { RuntimeContext } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Stage } from 'alchemy/Stage';
import * as D1Client from '@effect/sql-d1/D1Client';
import { Effect, Layer, Option, Scope } from 'effect';
import { Etag, HttpPlatform, HttpRouter } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';

import { EGWParagraphDatabase } from '@bible/core/egw-db';
import {
  MODEL_FINGERPRINT,
  QueryEmbedder,
  SearchCorpusSources,
  SearchService,
  VectorNeighbors,
} from '@bible/core/search';

import { SearchApi } from '../api.js';
import { SearchGroupLive } from '../search-api.js';
import { VectorIndexLoad } from '../vector-index.js';
import { Corpus, Vectors } from './resources.ts';
import { DOMAIN, SERVED_FROM, type ServedFrom, WORKER_NAME } from './site.ts';
import { vectorizeNeighbors, type VectorizeQuery } from './vectorize.ts';
import { EMBEDDING_MODEL, workersAiEmbedder } from './workers-ai.ts';

const ASSETS = {
  directory: 'dist',
  notFoundHandling: 'single-page-application',
  runWorkerFirst: ['/api/*', '/health'],
} satisfies Cloudflare.AssetsProps;

/** What `prod` claims, by where the search is served from. */
const PRODUCTION: Record<ServedFrom, Cloudflare.WorkerProps> = {
  'workers.dev': { name: WORKER_NAME, workersDev: true },
  'custom-domain': { name: WORKER_NAME, workersDev: false, domain: { name: DOMAIN } },
};

/** The props, by stage. The running Worker reads them without one. */
const props = Effect.gen(function* () {
  const stage = yield* Effect.serviceOption(Stage);
  const base = { main: import.meta.url, assets: ASSETS };
  if (!Option.contains(stage, 'prod')) return base;
  return { ...base, ...PRODUCTION[SERVED_FROM] };
});

/** The handles the search reads, as the running Worker holds them. */
interface Bindings {
  readonly corpus: D1Client.D1ClientConfig['db'];
  readonly vectors: VectorizeQuery;
  readonly ai: Cloudflare.Workers.AIClient;
}

/** The search's services over the Worker's bindings. */
const searchLayer = (bindings: Bindings) => {
  const sql = D1Client.layer({ db: bindings.corpus });
  const sources = Layer.effect(
    SearchCorpusSources,
    Effect.gen(function* () {
      const paragraphs = yield* EGWParagraphDatabase;
      return SearchCorpusSources.of({ _tag: 'wired', sources: { paragraphs } });
    }),
  ).pipe(Layer.provide(EGWParagraphDatabase.layerExisting));
  const neighbors = Layer.succeed(
    VectorNeighbors,
    VectorNeighbors.of(vectorizeNeighbors(bindings.vectors, MODEL_FINGERPRINT)),
  );
  const embedder = Layer.succeed(
    QueryEmbedder,
    QueryEmbedder.of(
      workersAiEmbedder((inputs) =>
        bindings.ai.run(EMBEDDING_MODEL, inputs).pipe(Effect.provide(RuntimeContext.phantom)),
      ),
    ),
  );
  const search = SearchService.layer.pipe(
    Layer.provide(Layer.mergeAll(sources, neighbors, embedder)),
  );
  // Nothing loads into memory: the vector leg can run from the first request.
  const ready = Layer.succeed(
    VectorIndexLoad,
    VectorIndexLoad.of({ readiness: Effect.succeed('ready' as const) }),
  );
  return Layer.mergeAll(search, ready).pipe(Layer.provideMerge(sql), Layer.orDie);
};

export default class Search extends Cloudflare.Worker<Search>()(
  'Search',
  props,
  Effect.gen(function* () {
    const corpus = yield* Cloudflare.D1.QueryDatabase(yield* Corpus);
    const vectors = yield* Cloudflare.Vectorize.SearchIndex(yield* Vectors);
    const ai = yield* Cloudflare.Workers.AI();
    // The constructor also runs at deploy time, to collect the bindings, and
    // the handles are empty then. So the app is built on the first request,
    // once per isolate, in a scope that lives as long as the isolate does.
    const scope = yield* Scope.make();
    const app = yield* Effect.cached(
      Effect.gen(function* () {
        const bindings: Bindings = {
          corpus: yield* corpus.raw,
          vectors: yield* vectors.raw,
          ai,
        };
        const api = HttpApiBuilder.layer(SearchApi).pipe(
          Layer.provide(SearchGroupLive.pipe(Layer.provide(searchLayer(bindings)))),
          Layer.provide(Layer.mergeAll(Etag.layer, HttpPlatform.layer)),
        );
        return yield* HttpRouter.toHttpEffect(api).pipe(Scope.provide(scope));
      }),
    );
    return { fetch: Effect.flatten(app) };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Cloudflare.D1.QueryDatabaseBinding,
        Cloudflare.Vectorize.SearchIndexBinding,
        Cloudflare.Workers.AIBinding,
      ),
    ),
  ),
) {}
