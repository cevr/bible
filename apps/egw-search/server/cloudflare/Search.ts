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
 * Only `/api/*`, `/health` and the sync's reports under `/sync`
 * (`./sync-pages.ts`) reach the Worker; every other path is an asset,
 * and an unknown one is the single-page app's `index.html`, as `spa: true`
 * makes it on the Bun server.
 *
 * The vector leg is ready from the first request: nothing is read into
 * memory, so `/health` always says `ready`. What is cold after an idle spell
 * is D1 and Vectorize themselves, so the Worker runs one of the page's
 * example searches every minute (`./warm.ts`).
 *
 * Where `prod` is served from follows `SERVED_FROM` (`./site.ts`). Any other
 * stage is a throwaway copy on a generated `workers.dev` name over the same
 * shared corpus (`./resources.ts`).
 */
import { RuntimeContext } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Stage } from 'alchemy/Stage';
import * as D1Client from '@effect/sql-d1/D1Client';
import { Effect, Exit, Layer, Option, Scope, Stream } from 'effect';
import { Etag, HttpPlatform, HttpRouter } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';

import { EGWParagraphDatabase } from '@bible/core/egw-db';
import { APPARATUS_AUTHORS } from '@bible/core/writings';
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
import { D1Atomic } from './d1-atomic.ts';
import { Corpus, SyncReports, Vectors } from './resources.ts';
import { DOMAIN, SERVED_FROM, type ServedFrom, WORKER_NAME } from './site.ts';
import { nameOfKey, type ReportStore, type StoredFile, syncRoutes } from './sync-pages.ts';
import { vectorizeNeighbors, type VectorizeQuery } from './vectorize.ts';
import { WARM_SCHEDULE, warmSearch } from './warm.ts';
import { EMBEDDING_MODEL, workersAiEmbedder } from './workers-ai.ts';

const ASSETS = {
  directory: 'dist',
  notFoundHandling: 'single-page-application',
  runWorkerFirst: ['/api/*', '/health', '/sync', '/sync/*'],
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

/** An R2 object as the report pages send it: its own stream when the
 *  platform offers one, so the bytes go to the response untouched; else its
 *  text, read once. */
const storedFile = (object: Cloudflare.R2.ObjectBody) =>
  Option.match(Option.fromNullishOr(object.readable), {
    onSome: (readable) =>
      Effect.succeedSome<StoredFile>({ body: readable, text: object.text().pipe(Effect.orDie) }),
    onNone: () =>
      object
        .text()
        .pipe(
          Effect.map((text) => Option.some<StoredFile>({ body: text, text: Effect.succeed(text) })),
        ),
  });

/** The search's services over the Worker's bindings. */
const searchLayer = (bindings: Bindings) => {
  const sql = D1Client.layer({ db: bindings.corpus });
  const sources = Layer.effect(
    SearchCorpusSources,
    Effect.gen(function* () {
      const paragraphs = yield* EGWParagraphDatabase;
      return SearchCorpusSources.of({ _tag: 'wired', sources: { paragraphs } });
    }),
  ).pipe(Layer.provide(EGWParagraphDatabase.layerExisting), Layer.provide(D1Atomic));
  const neighbors = Layer.effect(
    VectorNeighbors,
    Effect.gen(function* () {
      const paragraphs = yield* EGWParagraphDatabase;
      // The books apparatus by author, which the vectors' metadata cannot name
      // (`vectorizeFilter`). Read once an hour per isolate; a failed read is
      // read again on the next search, which meanwhile filters only by the
      // bodies it joins.
      const read = yield* Effect.cachedWithTTL(
        Stream.fromIterable(APPARATUS_AUTHORS).pipe(
          Stream.flatMap((author) => paragraphs.getBooksByAuthor(author)),
          Stream.map((book) => book.book_code),
          Stream.runCollect,
        ),
        (exit) => {
          if (Exit.isSuccess(exit)) return '1 hour';
          return 0;
        },
      );
      const apparatusBooks = read.pipe(
        Effect.catch((error) =>
          Effect.logWarning('search.apparatusBooks.unavailable', error).pipe(
            Effect.as<readonly string[]>([]),
          ),
        ),
      );
      return VectorNeighbors.of(
        vectorizeNeighbors(bindings.vectors, MODEL_FINGERPRINT, apparatusBooks),
      );
    }),
  ).pipe(Layer.provide(EGWParagraphDatabase.layerExisting), Layer.provide(D1Atomic));
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
    const reports = yield* Cloudflare.R2.ReadBucket(yield* SyncReports);
    /** The sync's reports, as its pages read them. A bucket that cannot be
     *  read is a failure of the request, so it answers an error. */
    const reportsPage = (cursor: Option.Option<string>) =>
      reports
        .list({ prefix: 'reports/', cursor: Option.getOrUndefined(cursor) })
        .pipe(Effect.provide(RuntimeContext.phantom), Effect.orDie);
    const store: ReportStore = {
      names: Effect.gen(function* () {
        const names: string[] = [];
        let cursor = Option.none<string>();
        while (true) {
          const page = yield* reportsPage(cursor);
          names.push(...page.objects.flatMap((object) => Option.toArray(nameOfKey(object.key))));
          if (!page.truncated) return names.sort();
          cursor = Option.some(page.cursor);
        }
      }),
      open: (key) =>
        reports.get(key).pipe(
          Effect.flatMap((object) =>
            Option.match(Option.fromNullishOr(object), {
              onNone: () => Effect.succeed(Option.none<StoredFile>()),
              onSome: (body) => storedFile(body),
            }),
          ),
          Effect.provide(RuntimeContext.phantom),
          Effect.orDie,
        ),
    };
    // The constructor also runs at deploy time, to collect the bindings, and
    // the handles are empty then. So the search is built on the first request
    // or warm-up, once per isolate, in a scope that lives as long as the
    // isolate does; the requests and the warm-ups share it.
    const scope = yield* Scope.make();
    const services = yield* Effect.cached(
      Effect.gen(function* () {
        const bindings: Bindings = {
          corpus: yield* corpus.raw,
          vectors: yield* vectors.raw,
          ai,
        };
        return yield* Layer.buildWithScope(searchLayer(bindings), scope);
      }),
    );
    const app = yield* Effect.cached(
      Effect.gen(function* () {
        const search = Layer.succeedContext(yield* services);
        const api = HttpApiBuilder.layer(SearchApi).pipe(
          Layer.provide(SearchGroupLive.pipe(Layer.provide(search))),
          Layer.provide(Layer.mergeAll(Etag.layer, HttpPlatform.layer)),
        );
        return yield* HttpRouter.toHttpEffect(Layer.mergeAll(api, syncRoutes(store))).pipe(
          Scope.provide(scope),
        );
      }),
    );
    yield* Cloudflare.Workers.cron(WARM_SCHEDULE, (controller) =>
      services.pipe(
        Effect.flatMap((context) =>
          warmSearch(controller.scheduledTime).pipe(Effect.provide(context)),
        ),
        Effect.catchCause((cause) => Effect.logWarning('search.warm.failed', cause)),
      ),
    );
    return { fetch: Effect.flatten(app) };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Cloudflare.D1.QueryDatabaseBinding,
        Cloudflare.Vectorize.SearchIndexBinding,
        Cloudflare.Workers.AIBinding,
        Cloudflare.R2.ReadBucketBinding,
        Cloudflare.Workers.CronEventSourceLive,
      ),
    ),
  ),
) {}
