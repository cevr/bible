// A film's page reads its narration where the tools write it, by the film's
// id, through the page's HTTP client; a film with no timings yet is laid out
// on estimates, as the tools lay it out, and a timings file the page cannot
// fetch or read fails, naming it. A film is given only once the faces it
// draws in have been asked for (`pictureFaces`, which waits for none of them:
// what draws the film waits, `face.test.ts`).

import { describe, expect, it } from 'effect-bun-test';
import { Deferred, Effect, Fiber, Layer } from 'effect';
import { HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse } from 'effect/http';
import { createFilm } from '../canvas/film.ts';
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
    HttpClient.mapRequest(client, HttpClientRequest.prependUrl('http://lab.test')),
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
      const given = Effect.promise(() => films.rbf()).pipe(
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
});
