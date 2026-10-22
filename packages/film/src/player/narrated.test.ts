// A film's page reads its narration where the tools write it, by the film's
// id, through the page's HTTP client; a film with no timings yet is laid out
// on estimates, as the tools lay it out, and a timings file the page cannot
// fetch or read fails, naming it. A film is given only once the faces it
// draws in have been asked for (`pictureFaces`, which waits for none of them:
// what draws the film waits, `face.test.ts`), with its Rive rigs loaded into
// its caller's scope: closing it frees them, and a load that fails frees what
// it had acquired at once.

import { describe, expect, it } from 'effect-bun-test';
import { Deferred, Effect, Exit, Fiber, Layer, Scope } from 'effect';
import { HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse } from 'effect/http';
import { createFilm } from '../canvas/film.ts';
import { armFilm, armRig, armScene } from '../canvas/fixtures/arm.ts';
import { countedRive } from '../canvas/fixtures/rive-counted.ts';
import { NO_TAKES, loadNarrated, narratedFilms, narrationUrls } from './narrated.ts';

const TIMINGS = '{"voice":"v","scenes":{}}';

/**
 * A client on a stand-in page: bun has no `location`, so a page-relative URL
 * is resolved against an origin here, as the browser resolves it against the
 * page's.
 */
const onPage = (client: HttpClient.HttpClient) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.mapRequest(client, HttpClientRequest.prependUrl('http://lab.slow.test')),
  );

/** A client that answers every URL with `status` and `body`, and notes the paths it was asked. */
const answering = (status: number, body = '') => {
  const asked: Array<string> = [];
  const client = HttpClient.make((request, url) => {
    asked.push(url.pathname);
    return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(body, { status })));
  });
  return { layer: onPage(client), asked };
};

/** A client whose every request fails on its way (the page offline). */
const offline = onPage(
  HttpClient.make((request) =>
    Effect.fail(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({ request, description: 'offline' }),
      }),
    ),
  ),
);

describe('loadNarrated', () => {
  it.effect("reads the film's timings by its id, and names its master beside them", () => {
    const { layer, asked } = answering(200, TIMINGS);
    return Effect.gen(function* () {
      const narrated = yield* loadNarrated('rbf');
      expect(asked).toEqual(['/films/rbf/narration/timings.json']);
      expect(narrated).toEqual({
        timings: { voice: 'v', scenes: {} },
        audio: narrationUrls('rbf').audio,
      });
    }).pipe(Effect.provide(layer));
  });

  it.effect('a film with no timings file yet is laid out on estimates, as the tools read it', () =>
    Effect.gen(function* () {
      expect((yield* loadNarrated('rbf')).timings).toEqual(NO_TAKES);
    }).pipe(Effect.provide(answering(404).layer)),
  );

  for (const [what, layer, why] of [
    ['a server error', answering(500).layer, 'status 500'],
    ['a file that is not timings', answering(200, '{"voice": 3}').layer, 'voice'],
    ['a fetch that fails', offline, 'offline'],
  ] as const)
    it.effect(`${what} fails, naming the film and the file and why, never estimates`, () =>
      Effect.gen(function* () {
        const failed = yield* Effect.flip(loadNarrated('rbf'));
        expect(failed).toMatchObject({
          _tag: 'NarrationUnreadable',
          film: 'rbf',
          url: '/films/rbf/narration/timings.json',
        });
        expect(failed.reason).toContain(why);
      }).pipe(Effect.provide(layer)),
    );
});

describe('narratedFilms', () => {
  it.live('a film is given only once its faces have been asked for: a slow ask holds it', () =>
    Effect.gen(function* () {
      const happened: Array<string> = [];
      const moduleAsked = yield* Deferred.make<boolean>();
      const facesAsked = yield* Deferred.make<boolean>();
      const toy = createFilm({
        title: 'toy',
        paper: { base: '#fff', tone: '#000', seed: 1 },
        shade: '#000',
        scenes: [{ id: 'one', say: 'A line.', draw: () => undefined }],
      });
      const films = narratedFilms(
        {
          rbf: () =>
            Effect.runPromise(Effect.as(Deferred.succeed(moduleAsked, true), { film: () => toy })),
        },
        Effect.andThen(
          Deferred.await(facesAsked),
          Effect.sync(() => happened.push('faces asked')),
        ),
        answering(404).layer,
      );
      const given = Effect.scoped(films.rbf).pipe(
        Effect.tap(() => Effect.sync(() => happened.push('film given'))),
      );
      const loading = yield* Effect.forkChild(given);
      // The film's module and its narration are in; its faces are not yet asked for.
      yield* Deferred.await(moduleAsked);
      yield* Effect.yieldNow;
      expect(happened).toEqual([]);
      yield* Deferred.succeed(facesAsked, true);
      expect(yield* Fiber.join(loading)).toBe(toy);
      expect(happened).toEqual(['faces asked', 'film given']);
    }),
  );

  /** A registry of the arm's film (its one rig loaded by `rive`) and a film whose second rig cannot load. */
  const armFilms = (rive: ReturnType<typeof countedRive>['layer']) =>
    narratedFilms(
      {
        arm: () => Promise.resolve({ film: () => armFilm([armScene('arm', 'webgl2')]) }),
        broken: () =>
          Promise.resolve({
            film: () => {
              const arm = armRig('webgl2');
              const leg = { ...arm, key: 'leg', source: { ...arm.source, artboard: 'Leg' } };
              return armFilm([
                armScene('arm', 'webgl2'),
                { id: 'leg', min: 4, rigs: { leg }, draw: () => {} },
              ]);
            },
          }),
      },
      Effect.void,
      answering(404).layer,
      rive,
    );

  it.live("each load's rigs are its caller's: closing the scope it was given frees them", () =>
    Effect.gen(function* () {
      const { counts, layer } = countedRive();
      const films = armFilms(layer);
      // Five mounts, each loading the film into a scope of its own and closing it as it goes.
      for (let mount = 0; mount < 5; mount++) {
        const scope = yield* Scope.make();
        const film = yield* Scope.provide(films.arm, scope);
        expect(film.rigs.declared.length).toBe(1);
        yield* Scope.close(scope, Exit.void);
      }
      expect(counts.files).toBe(5);
      expect(counts.unrefs).toBe(counts.files);
      expect(counts.deletes).toBe(counts.artboards);
    }),
  );

  it.live(
    'a load that fails frees what it had acquired, though its caller holds its scope open',
    () =>
      Effect.gen(function* () {
        const { counts, layer } = countedRive();
        const films = armFilms(layer);
        const scope = yield* Scope.make();
        const failed = yield* Effect.flip(Scope.provide(films.broken, scope));
        expect(failed).toMatchObject({ _tag: 'RigNameMissing', kind: 'artboard', name: 'Leg' });
        // The arm's file and the leg's were both loaded, and both are freed already.
        expect(counts.files).toBe(2);
        expect(counts.unrefs).toBe(2);
        expect(counts.deletes).toBe(counts.artboards);
        yield* Scope.close(scope, Exit.void);
      }),
  );
});
