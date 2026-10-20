import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Effect, Layer, Option } from 'effect';
import { TestConsole } from 'effect/testing';
import { HttpClient, HttpClientResponse, HttpServerRequest, HttpServerResponse } from 'effect/http';

import { send } from '../../scripts/mail-send.ts';
import { SERIES, type Series } from '../content.ts';
import { Assets } from '../worker/assets.ts';
import { respond } from '../worker/respond.ts';
import { layerOf } from './films.ts';
import { List } from './list.ts';
import { layerTest, TEST_ADMIN_TOKEN } from './local.ts';
import { Queued } from './queue.ts';
import { Address } from './address.ts';

const ORIGIN = 'https://firsttheblade.test';

const WITH_A_FILM: ReadonlyArray<Series> = SERIES.map((series) => {
  if (series.id !== 'path') return series;
  return {
    ...series,
    episodes: [
      {
        no: '01',
        title: 'A test film',
        youtubeId: 'test-video',
        published: '2026-11-01',
        summary: 'A summary for the test.',
      },
    ],
  };
});

const AssetsTest = Layer.succeed(
  Assets,
  Assets.of({ serve: () => Effect.succeed(HttpServerResponse.text('page')) }),
);

const services = Layer.mergeAll(AssetsTest, layerTest(layerOf(WITH_A_FILM))).pipe(
  Layer.provide(BunServices.layer),
);

/** A client whose every request is answered by the Worker's policy, in this process. */
const layerClient = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const context = yield* Effect.context<Layer.Success<typeof services>>();
    return HttpClient.make((request, url) =>
      Effect.gen(function* () {
        const sent = Option.liftPredicate(request.body, (body) => body._tag === 'Uint8Array');
        const web = new Request(url, {
          method: request.method,
          headers: request.headers,
          body: Option.getOrUndefined(Option.map(sent, (body) => new Uint8Array(body.body))),
        });
        const answer = yield* respond(HttpServerRequest.fromWeb(web));
        return HttpClientResponse.fromWeb(request, HttpServerResponse.toWeb(answer));
      }).pipe(Effect.provideContext(context)),
    );
  }),
);

const test = it.effect.layer(
  Layer.mergeAll(layerClient, TestConsole.layer).pipe(
    Layer.provideMerge(services),
    Layer.provideMerge(
      ConfigProvider.layer(ConfigProvider.fromUnknown({ MAIL_ADMIN_TOKEN: TEST_ADMIN_TOKEN })),
    ),
  ),
);

describe('bun run mail:send', () => {
  test('counts on a dry run and queues on a send, through the Worker', () =>
    Effect.gen(function* () {
      const list = yield* List;
      const claim = Option.getOrThrow(yield* list.signUp(Address.make('ann@example.com'), 0));
      yield* list.confirm(claim, 1);
      yield* send({ film: 'path/01', dryRun: true, origin: ORIGIN });
      yield* send({ film: 'path/01', dryRun: false, origin: ORIGIN });
      const said = (yield* TestConsole.logLines).filter((line) => String(line).startsWith('path/'));
      expect(said).toEqual([
        'path/01: 1 confirmed, 0 sent, 0 refused, 1 waiting. Dry run: nothing queued.',
        'path/01: 1 confirmed, 0 sent, 0 refused, 1 waiting. Queued 1 to send now.',
      ]);
      expect(yield* (yield* Queued).deliveries).toHaveLength(1);
    }));

  test('fails with the Worker’s words when it refuses', () =>
    Effect.gen(function* () {
      const failed = yield* Effect.flip(send({ film: 'path/99', dryRun: false, origin: ORIGIN }));
      expect(failed.message).toContain('404 no film path/99 on the site');
    }));
});
