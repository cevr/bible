import { BunHttpServer } from '@effect/platform-bun';
import { HttpServer, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { test } from 'bun:test';
import { Context, Effect, Exit, Layer, Option, Scope } from 'effect';
import { expect, it } from 'effect-bun-test';
import { LabApi, LabClient, NotesApi, labApiLayer, stepWhyNot } from './api.ts';
import { StudioApi, studioApiLayer } from './studio/api.ts';
import { Unfit } from '../command/command.ts';
import { ChangeId } from '../core/schema.ts';

/** Changes in a film's history, by the ids the lab gave them. */
const K0 = ChangeId.make('k0');
const K1 = ChangeId.make('k1');
const K2 = ChangeId.make('k2');
const K9 = ChangeId.make('k9');

test("a receipt's step takes its own change on its own film, or says why not", () => {
  const steps = Option.some({
    undo: { file: 'sound.ts', target: 'level RAIN -6', change: K2 },
    redo: { file: 'sound.ts', target: 'score play piano', change: K0 },
  });
  const now = (reason: string) => Option.some(Unfit.Now({ reason }));
  const undo = stepWhyNot('undo', 'one', steps);
  expect(undo({ film: 'one', change: K2 })).toEqual(Option.none());
  // Two quick edits: the older one's Undo names the newer that stands before it.
  expect(undo({ film: 'one', change: K1 })).toEqual(
    now('level RAIN -6 came after it: undo that first'),
  );
  expect(undo({ film: 'one', change: K0 })).toEqual(now('it is undone already'));
  // A receipt carried to another film's page never steps that film's history.
  expect(undo({ film: 'two', change: K2 })).toEqual(
    now('that was a change to two: open two to undo it'),
  );
  expect(stepWhyNot('redo', 'one', steps)({ film: 'one', change: K2 })).toEqual(
    now('it is redone already'),
  );
  // The history still being read: the command is not available, and says that instead.
  expect(stepWhyNot('undo', 'one', Option.none())({ film: 'one', change: K1 })).toEqual(
    Option.none(),
  );
});

test("a receipt's step with nothing to step that way: undone already, or the lab no longer has it", () => {
  // Undone, and nothing else to undo: the Redo stack's newest is its own change.
  const undone = Option.some({
    redo: { file: 'sound.ts', target: 'score play piano', change: K0 },
  });
  expect(stepWhyNot('undo', 'one', undone)({ film: 'one', change: K0 })).toEqual(
    Option.some(Unfit.Now({ reason: 'it is undone already' })),
  );
  // The lab restarted (its history is in memory): no step either way, and no press ever can.
  expect(stepWhyNot('undo', 'one', Option.some({}))({ film: 'one', change: K0 })).toEqual(
    Option.some(
      Unfit.Never({
        reason:
          'the lab no longer has that change to undo: it was undone already, or the lab restarted since',
      }),
    ),
  );
  expect(stepWhyNot('redo', 'one', undone)({ film: 'one', change: K9 })).toEqual(
    Option.some(Unfit.Now({ reason: 'score play piano was undone after it: redo that first' })),
  );
});

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
        ).pipe(Layer.provide(LabClient.layerAt(host.origin)));
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
