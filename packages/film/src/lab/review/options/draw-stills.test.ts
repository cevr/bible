// A Project's stills load their film into the scope they are drawn in, so
// what the film holds (its Rive rigs) goes with the Project that showed them:
// a Project mounted and left again and again leaves no rig behind. Its load
// runs on the stills' fiber, so a Project left mid-load stops it where it is,
// and frees what it holds only once the load is done with it.

import { describe, expect, it } from 'effect-bun-test';
import { Deferred, Effect, Exit, Fiber, Layer, Option, Scope } from 'effect';
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http';
import { Footage } from '../../../browser/footage.ts';
import { hostOf } from '../../../browser/host.ts';
import { armFilm, armScene } from '../../../canvas/fixtures/arm.ts';
import { countedRive } from '../../../canvas/fixtures/rive-counted.ts';
import { narratedFilms } from '../../../player/narrated.ts';
import { drawStills } from './draw-stills.ts';

/** A page whose every request is a 404: the film has no takes yet, so it is laid out on estimates. */
const noTakes = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.mapRequest(
    HttpClient.make((request) =>
      Effect.succeed(HttpClientResponse.fromWeb(request, new Response('', { status: 404 }))),
    ),
    HttpClientRequest.prependUrl('http://lab.test'),
  ),
);

/** A Project's ask for stills: its turn, its clock, no footage. */
const HOW = {
  turn: () => Effect.runPromise(Effect.void),
  now: () => 0,
  footage: hostOf(Footage.none),
};

/** The arm's registry, its rigs loaded through `rive`, its faces in once `faces` is. */
const armFilms = (rive: ReturnType<typeof countedRive>['layer'], faces = Effect.void) =>
  narratedFilms(
    {
      arm: () =>
        Effect.runPromise(Effect.succeed({ film: () => armFilm([armScene('arm', 'webgl2')]) })),
    },
    faces,
    noTakes,
    rive,
  );

/** stills.tsx's cleanup as a Project is left: its drawing stopped, then its scope closed. */
const leave = (drawing: Fiber.Fiber<unknown, unknown>, scope: Scope.Closeable) =>
  Effect.andThen(Fiber.interrupt(drawing), Scope.close(scope, Exit.void));

describe('drawStills', () => {
  it.live('a Project left while its film waits for its faces stops the load where it is', () =>
    Effect.gen(function* () {
      const { counts, layer } = countedRive();
      const asked = yield* Deferred.make<boolean>();
      const stopped = yield* Deferred.make<boolean>();
      const faces = Effect.andThen(
        Deferred.succeed(asked, true),
        Effect.onInterrupt(Effect.never, () => Deferred.succeed(stopped, true)),
      );
      const load = yield* Effect.fromOption(drawStills(armFilms(layer, faces))('arm', HOW));
      const scope = yield* Scope.make();
      const drawing = yield* Effect.forkChild(Scope.provide(load, scope));
      yield* Deferred.await(asked);
      yield* leave(drawing, scope);
      // Left, the Project's load waits for nothing more: no load goes on without it.
      expect(yield* Deferred.isDone(stopped)).toBe(true);
      expect(counts.files).toBe(0);
    }),
  );

  it.live(
    'a Project left while its film still loads frees each file once, after the load is done with it',
    () =>
      Effect.gen(function* () {
        const { counts, faults, layer } = countedRive();
        // The rig's file is held as it is parsed, until the Project has been left.
        const parsing = yield* Deferred.make<boolean>();
        const parse = yield* Deferred.make<boolean>();
        faults.parsed = () =>
          Effect.runPromise(
            Effect.andThen(Deferred.succeed(parsing, true), Effect.asVoid(Deferred.await(parse))),
          );
        const load = yield* Effect.fromOption(drawStills(armFilms(layer))('arm', HOW));
        // stills.tsx: the mount's scope, the drawing forked in it.
        const scope = yield* Scope.make();
        const drawing = yield* Effect.forkChild(Scope.provide(load, scope));
        yield* Deferred.await(parsing);
        // The Project is left mid-load: its cleanup starts, then the file is parsed.
        const unmount = yield* Effect.forkChild(leave(drawing, scope));
        yield* Effect.yieldNow;
        yield* Deferred.succeed(parse, true);
        // Once the Project's cleanup is done, so is its load, and what it held is freed.
        yield* Fiber.join(unmount);
        expect(counts.afterFree).toBe(0);
        expect(counts.files).toBe(1);
        expect(counts.unrefs).toBe(counts.files);
        expect(counts.deletes).toBe(counts.artboards);
        expect(counts.viewModelDeletes).toBe(counts.viewModels);
      }),
  );

  it.live("loads the film into the stills' scope: five mounts left, no rig left behind", () =>
    Effect.gen(function* () {
      const { counts, layer } = countedRive();
      const draw = drawStills(armFilms(layer));
      for (let mount = 0; mount < 5; mount++) {
        const scope = yield* Scope.make();
        const load = yield* Effect.fromOption(draw('arm', HOW));
        const stills = yield* Scope.provide(load, scope);
        expect([...stills.middles.keys()]).toEqual(['arm']);
        yield* Scope.close(scope, Exit.void);
      }
      expect(counts.files).toBe(5);
      expect(counts.unrefs).toBe(counts.files);
      expect(counts.deletes).toBe(counts.artboards);
      expect(Option.isNone(draw('no-such-film', HOW))).toBe(true);
    }),
  );
});
