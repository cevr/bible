// A Project's stills load their film into the scope they are drawn in, so
// what the film holds (its Rive rigs) goes with the Project that showed them:
// a Project mounted and left again and again leaves no rig behind.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Exit, Layer, Option, Scope } from 'effect';
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

describe('drawStills', () => {
  it.live("loads the film into the stills' scope: five mounts left, no rig left behind", () =>
    Effect.gen(function* () {
      const { counts, layer } = countedRive();
      const films = narratedFilms(
        {
          arm: () =>
            Effect.runPromise(Effect.succeed({ film: () => armFilm([armScene('arm', 'webgl2')]) })),
        },
        Effect.void,
        noTakes,
        layer,
      );
      const draw = drawStills(films);
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
