/* oxlint-disable effect/noGlobals, effect/noNullish -- this is an owned browser fixture process.
 * Its mutable receipt state is the test server's lifecycle boundary, not an
 * application service or production endpoint. */

import { ActorHost, HttpServer, Query } from 'effect-frame/actor';
import { BunHttpServer, BunRuntime, BunServices } from '@effect/platform-bun';
import { Deferred, Effect, Exit, Layer, Schema } from 'effect';
import {
  HttpMiddleware,
  HttpPlatform,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
  HttpStaticServer,
  HttpServer as PlatformHttpServer,
} from 'effect/unstable/http';

import { actorPrefix, Search, type SearchRequest } from '../../src/contract.js';
import type { SearchResponse } from '../../server/api.js';

const PORT = Number(process.env['PORT'] ?? 3187);
const STATIC_ROOT = `${import.meta.dir}/../../dist`;

class FixtureQueryFailure extends Schema.TaggedError<FixtureQueryFailure>()('FixtureQueryFailure', {
  reason: Schema.String,
}) {}

interface FixtureState {
  readonly holdStarted: Deferred.Deferred<void>;
  readonly holdWork: Deferred.Deferred<void>;
  readonly holdReleased: Deferred.Deferred<void>;
  batchHttpRequests: number;
  singleHttpRequests: number;
  queryBatches: number;
  holdReleases: number;
  holdHandlerInterruptions: number;
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
        queryBatches: 0,
        holdReleases: 0,
        holdHandlerInterruptions: 0,
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
  return {
    hits: [
      {
        refcode: `fixture-${request.q}`,
        bookCode: 'FIX',
        bookTitle: 'Fixture Book',
        author: 'Ellen White',
        text,
        isHeading: false,
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

const resolveFixtureBatch = (requests: ReadonlyArray<SearchRequest>) =>
  Effect.gen(function* () {
    // Keep every resolver attached to the batch that created it. A reset can
    // replace the current receipt state while an old request still unwinds.
    const batchState = state;
    batchState.queryBatches += 1;
    batchState.lastBatch = requests.map((request) => request.q);
    const hasHold = requests.some((request) => request.q === 'hold');
    if (hasHold) {
      heldBatch = batchState;
      yield* Deferred.succeed(batchState.holdStarted, void 0);
      return yield* Effect.gen(function* () {
        yield* Deferred.await(batchState.holdWork);
        batchState.holdWorkObserved += 1;
        return (request: SearchRequest) => Effect.succeed(fixtureResponse(request));
      }).pipe(
        Effect.onExit((exit) =>
          Effect.gen(function* () {
            if (Exit.hasInterrupts(exit)) batchState.holdHandlerInterruptions += 1;
            batchState.holdReleases += 1;
            yield* Deferred.succeed(batchState.holdReleased, void 0);
          }),
        ),
      );
    }
    if (requests.some((request) => request.q === 'fail')) {
      return yield* FixtureQueryFailure.make({ reason: 'controlled fixture failure' });
    }
    return (request: SearchRequest) => Effect.succeed(fixtureResponse(request));
  });

const SearchFixture = Query.batched(Search, { resolve: resolveFixtureBatch });

const ActorsLive = ActorHost.layer({ implementations: [], queries: [SearchFixture] });

const ActorsRouteLive = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const handle = yield* HttpServer.make;
    yield* router.add('*', `${actorPrefix}/*`, (request) =>
      Effect.gen(function* () {
        const web = yield* HttpServerRequest.toWeb(request);
        const url = new URL(web.url);
        url.pathname = url.pathname.slice(actorPrefix.length);
        if (url.pathname === '/query/batch') state.batchHttpRequests += 1;
        if (url.pathname === '/query') state.singleHttpRequests += 1;
        const response = yield* handle(new Request(url, web));
        return HttpServerResponse.fromWeb(response);
      }),
    );
  }),
).pipe(Layer.provide(ActorsLive));

const FixtureRoutes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    yield* router.add('GET', '/__fixture/ready', HttpServerResponse.jsonUnsafe({ ready: true }));
    yield* router.add('POST', '/__fixture/reset', () =>
      Effect.sync(() => {
        state = makeFixtureState();
        return HttpServerResponse.jsonUnsafe({ reset: true });
      }),
    );
    yield* router.add('GET', '/__fixture/receipts', () =>
      Effect.sync(() =>
        (() => {
          const held = heldBatch;
          return HttpServerResponse.jsonUnsafe({
            batchHttpRequests: state.batchHttpRequests,
            singleHttpRequests: state.singleHttpRequests,
            queryBatches: state.queryBatches,
            holdReleases: held?.holdReleases ?? 0,
            holdHandlerInterruptions: held?.holdHandlerInterruptions ?? 0,
            holdWorkCompletions: held?.holdWorkCompletions ?? 0,
            holdWorkObserved: held?.holdWorkObserved ?? 0,
            lastBatch: state.lastBatch,
          });
        })(),
      ),
    );
    yield* router.add('GET', '/__fixture/hold-ready', () => {
      const batch = state;
      return Effect.as(
        Deferred.await(batch.holdStarted),
        HttpServerResponse.jsonUnsafe({ ready: true }),
      );
    });
    yield* router.add('GET', '/__fixture/hold-complete', () =>
      Effect.gen(function* () {
        const batch = heldBatch;
        if (batch === undefined) return HttpServerResponse.jsonUnsafe({ completed: false });
        const completed = yield* Deferred.succeed(batch.holdWork, void 0);
        if (completed) batch.holdWorkCompletions += 1;
        return HttpServerResponse.jsonUnsafe({ completed });
      }),
    );
    yield* router.add('GET', '/__fixture/hold-released', () => {
      const batch = heldBatch ?? state;
      return Effect.as(
        Deferred.await(batch.holdReleased),
        HttpServerResponse.jsonUnsafe({ released: true }),
      );
    });
  }),
);

const StaticLive = HttpStaticServer.layer({ root: STATIC_ROOT, spa: true, index: 'index.html' });
const RouterLive = Layer.mergeAll(StaticLive, ActorsRouteLive, FixtureRoutes);

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

const PlatformLive = Layer.mergeAll(
  HttpPlatform.layer.pipe(Layer.provide(BunServices.layer)),
  BunServices.layer,
);

Layer.launch(HttpLive).pipe(Effect.provide(PlatformLive), BunRuntime.runMain);
