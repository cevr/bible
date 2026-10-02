import { BunHttpServer } from '@effect/platform-bun';
import { HttpServer, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { Context, Effect, Exit, Layer, Scope } from 'effect';
import { expect, it } from 'effect-bun-test';
import { LabApi, LabClient, NotesApi, labApiLayer } from './api.ts';
import { StudioApi, studioApiLayer } from './studio/api.ts';

/** Real typed responses at independent origins; every request records its destination. */
const server = Effect.gen(function* () {
  const asked: Array<string> = [];
  const http = yield* BunHttpServer.make({ hostname: '127.0.0.1', port: 0 });
  yield* http.serve(
    Effect.gen(function* () {
      const path = new URL((yield* HttpServerRequest.HttpServerRequest).url, 'http://localhost')
        .pathname;
      asked.push(path);
      const film = path.split('/')[3];
      if (path.endsWith('/check')) return HttpServerResponse.jsonUnsafe({ findings: [] });
      if (path.endsWith('/notes'))
        return HttpServerResponse.jsonUnsafe({ film, seq: 0, notes: [] });
      if (path.endsWith('/studio/beats')) return HttpServerResponse.jsonUnsafe({ film, beats: [] });
      return HttpServerResponse.empty({ status: 404 });
    }),
  );
  return { asked, origin: HttpServer.formatAddress(http.address) };
});

it.live(
  'a page shares its typed client until its last panel closes; another page has its own origin',
  () =>
    Effect.gen(function* () {
      const first = yield* server;
      const second = yield* server;
      const parent = yield* Effect.scope;
      // Atom runtimes in one RegistryProvider use this same MemoMap, with separate owner scopes.
      const memo = yield* Layer.makeMemoMap;
      for (const [film, host] of [
        ['one', first],
        ['two', second],
      ] as const) {
        const lifetime: Array<string> = [];
        const client = Layer.effect(
          LabClient,
          Effect.gen(function* () {
            const value = yield* LabClient;
            lifetime.push('acquired');
            yield* Effect.addFinalizer(() => Effect.sync(() => lifetime.push('released')));
            return value;
          }),
        ).pipe(Layer.provide(LabClient.layer(host.origin)));
        const labScope = yield* Scope.fork(parent);
        const studioScope = yield* Scope.fork(parent);
        const lab = yield* Layer.buildWithMemoMap(
          labApiLayer(film).pipe(Layer.provide(client)),
          memo,
          labScope,
        );
        const studio = yield* Layer.buildWithMemoMap(
          studioApiLayer(film).pipe(Layer.provide(client)),
          memo,
          studioScope,
        );
        expect(lifetime).toEqual(['acquired']);
        expect(yield* Context.get(lab, LabApi).check).toEqual({ findings: [] });
        expect(yield* Context.get(lab, NotesApi).notes).toEqual({ film, seq: 0, notes: [] });
        expect(yield* Context.get(studio, StudioApi).beats).toEqual({ film, beats: [] });
        yield* Scope.close(labScope, Exit.void);
        expect(lifetime).toEqual(['acquired']);
        expect(yield* Context.get(studio, StudioApi).beats).toEqual({ film, beats: [] });
        yield* Scope.close(studioScope, Exit.void);
        expect(lifetime).toEqual(['acquired', 'released']);
        expect(host.asked).toEqual([
          `/api/films/${film}/check`,
          `/api/films/${film}/notes`,
          `/api/films/${film}/studio/beats`,
          `/api/films/${film}/studio/beats`,
        ]);
      }
    }).pipe(Effect.scoped),
);
