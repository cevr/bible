/* oxlint-disable effect/noGlobals, effect/noNullish -- this is an owned browser fixture process.
 * Its mutable receipt state is the test server's lifecycle boundary, not an
 * application service or production endpoint. */

/**
 * The browser suite's server: the app's own `SearchApi` and the built page,
 * with deterministic answers in place of the corpus.
 *
 * It serves `dist/` the way `../../server/main.ts` does, and answers the same
 * endpoints the page calls. A query of `hold` waits until the test releases
 * it, and a query of `fail` fails its slot, so the suite can watch a batch in
 * flight, its cancellation, and a typed failure. `/__fixture/*` reports what
 * the server saw.
 */

import { BunHttpServer, BunRuntime, BunServices } from '@effect/platform-bun';
import { Deferred, Effect, Exit, Layer } from 'effect';
import {
  Etag,
  HttpMiddleware,
  HttpPlatform,
  HttpRouter,
  HttpServer,
  HttpServerResponse,
  HttpStaticServer,
} from 'effect/unstable/http';
import { HttpApiBuilder } from 'effect/unstable/httpapi';

import {
  NO_SELECTION,
  SearchApi,
  type SearchRequest,
  type SearchResponse,
  type SearchSlot,
} from '../../server/api.js';

/** The Playwright config passes its port as `PORT`. */
const PORT = Number(process.env['PORT'] ?? 3187);
const STATIC_ROOT = `${import.meta.dir}/../../dist`;

interface FixtureState {
  readonly holdStarted: Deferred.Deferred<void>;
  readonly holdWork: Deferred.Deferred<void>;
  readonly holdReleased: Deferred.Deferred<void>;
  batchHttpRequests: number;
  singleHttpRequests: number;
  holdReleases: number;
  holdInterruptions: number;
  holdWorkCompletions: number;
  holdWorkObserved: number;
  lastBatch: ReadonlyArray<string>;
}

const makeFixtureState = (): FixtureState =>
  Effect.runSync(
    Effect.gen(function* () {
      return {
        holdStarted: yield* Deferred.make<void>(),
        holdWork: yield* Deferred.make<void>(),
        holdReleased: yield* Deferred.make<void>(),
        batchHttpRequests: 0,
        singleHttpRequests: 0,
        holdReleases: 0,
        holdInterruptions: 0,
        holdWorkCompletions: 0,
        holdWorkObserved: 0,
        lastBatch: [],
      } satisfies FixtureState;
    }),
  );

let state = makeFixtureState();
let heldBatch: FixtureState | undefined;

const paragraph = (text: string) => ({
  refcode: null,
  text,
  url: null,
  isHeading: false,
});

const fixtureResponse = (request: SearchRequest): SearchResponse => {
  let text = request.q;
  if (request.scope !== 'all') text = `${request.q} [${request.scope}]`;
  // `labels` answers with a chapter heading in its book's back matter, so the
  // suite can see both of a row's labels.
  const labelled = request.q === 'labels';
  return {
    hits: [
      {
        refcode: `fixture-${request.q}`,
        bookCode: 'FIX',
        bookTitle: 'Fixture Book',
        author: 'Ellen White',
        text,
        isHeading: labelled,
        backMatter: labelled,
        lexicalRank: 1,
        vectorRank: null,
        url: null,
        before: [paragraph(`${request.q} before one`), paragraph(`${request.q} before two`)],
        after: [paragraph(`${request.q} after one`), paragraph(`${request.q} after two`)],
      },
    ],
    scope: request.scope,
    vector: 'fixture',
    nonSelective: false,
  };
};

const slotFor = (request: SearchRequest): SearchSlot => {
  if (request.q === 'fail') return { _tag: 'Failed', message: 'controlled fixture failure' };
  return { _tag: 'Answered', response: fixtureResponse(request) };
};

const answerBatch = (requests: ReadonlyArray<SearchRequest>) =>
  Effect.gen(function* () {
    // Keep the batch attached to the receipts that saw it start. A reset can
    // replace the current receipts while an old batch still unwinds.
    const batchState = state;
    batchState.batchHttpRequests += 1;
    batchState.lastBatch = requests.map((request) => request.q);
    if (!requests.some((request) => request.q === 'hold')) return requests.map(slotFor);

    heldBatch = batchState;
    yield* Deferred.succeed(batchState.holdStarted, undefined);
    return yield* Deferred.await(batchState.holdWork).pipe(
      Effect.andThen(
        Effect.sync(() => {
          batchState.holdWorkObserved += 1;
          return requests.map(slotFor);
        }),
      ),
      Effect.onExit((exit) =>
        Effect.gen(function* () {
          if (Exit.hasInterrupts(exit)) batchState.holdInterruptions += 1;
          batchState.holdReleases += 1;
          yield* Deferred.succeed(batchState.holdReleased, undefined);
        }),
      ),
    );
  });

const SearchFixtureLive = HttpApiBuilder.group(SearchApi, 'search', (handlers) =>
  Effect.succeed(
    handlers
      .handle('health', () => Effect.succeed({ ok: true, vector: 'fixture' }))
      .handle('query', ({ query }) =>
        Effect.sync(() => {
          state.singleHttpRequests += 1;
          return fixtureResponse({
            q: query.q,
            scope: query.scope ?? 'all',
            section: query.section ?? NO_SELECTION,
            type: query.type ?? NO_SELECTION,
            subtype: query.subtype ?? NO_SELECTION,
            excludeApparatus: query.noref === '1',
            limit: query.limit ?? 40,
            context: query.context ?? 1,
          });
        }),
      )
      .handle('batch', ({ payload }) =>
        Effect.map(answerBatch(payload.requests), (results) => ({ results })),
      ),
  ),
);

const ApiLive = HttpApiBuilder.layer(SearchApi).pipe(Layer.provide(SearchFixtureLive));

const FixtureRoutes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    yield* router.add('GET', '/__fixture/ready', HttpServerResponse.jsonUnsafe({ ready: true }));
    yield* router.add('POST', '/__fixture/reset', () =>
      Effect.sync(() => {
        state = makeFixtureState();
        heldBatch = undefined;
        return HttpServerResponse.jsonUnsafe({ reset: true });
      }),
    );
    yield* router.add('GET', '/__fixture/receipts', () =>
      Effect.sync(() => {
        const held = heldBatch;
        return HttpServerResponse.jsonUnsafe({
          batchHttpRequests: state.batchHttpRequests,
          singleHttpRequests: state.singleHttpRequests,
          holdReleases: held?.holdReleases ?? 0,
          holdInterruptions: held?.holdInterruptions ?? 0,
          holdWorkCompletions: held?.holdWorkCompletions ?? 0,
          holdWorkObserved: held?.holdWorkObserved ?? 0,
          lastBatch: state.lastBatch,
        });
      }),
    );
    yield* router.add('GET', '/__fixture/hold-ready', () =>
      Effect.as(Deferred.await(state.holdStarted), HttpServerResponse.jsonUnsafe({ ready: true })),
    );
    yield* router.add('GET', '/__fixture/hold-complete', () =>
      Effect.gen(function* () {
        const batch = heldBatch;
        if (batch === undefined) return HttpServerResponse.jsonUnsafe({ completed: false });
        const completed = yield* Deferred.succeed(batch.holdWork, undefined);
        if (completed) batch.holdWorkCompletions += 1;
        return HttpServerResponse.jsonUnsafe({ completed });
      }),
    );
    yield* router.add('GET', '/__fixture/hold-released', () =>
      Effect.as(
        Deferred.await((heldBatch ?? state).holdReleased),
        HttpServerResponse.jsonUnsafe({ released: true }),
      ),
    );
  }),
);

/** The built page, served as the app serves it: unknown paths get the app. */
const StaticLive = HttpStaticServer.layer({ root: STATIC_ROOT, spa: true, index: 'index.html' });

const RouterLive = Layer.mergeAll(StaticLive, ApiLive, FixtureRoutes);

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

const PlatformLive = Layer.mergeAll(
  Etag.layer,
  HttpPlatform.layer.pipe(Layer.provide(BunServices.layer)),
  BunServices.layer,
);

Layer.launch(HttpLive).pipe(Effect.provide(PlatformLive), BunRuntime.runMain);
