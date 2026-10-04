// `film look` as a client of the lab's look route: a request it cannot even
// send (a size the route refuses) is `LookInvalid`, asked of no lab, never
// `LabDown`; and a failure prints as the very JSON the route answers with,
// one shape for a tool to read whichever side it came from.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Schema } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientResponse } from 'effect/http';
import { ToolFailure } from '../core/api.ts';
import { type LookPost, ToolFailed } from '../core/easel.ts';
import { failureJson, takeLook } from './easel-cli.ts';

/** A lab that answers every request with `status` and `body`, each request counted in `asked`. */
const labAnswering = (status: number, body: string, asked: Array<string>) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.sync(() => {
        asked.push(request.url);
        return HttpClientResponse.fromWeb(
          request,
          new Response(body, { status, headers: { 'content-type': 'application/json' } }),
        );
      }),
    ),
  );

const post = (size: number): LookPost => ({
  scene: 'roof',
  at: ['1'],
  view: { mode: 'plain', captions: false, format: 'image/png', size },
});

const parse = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));
const decodeFailure = Schema.decodeUnknownSync(Schema.fromJsonString(ToolFailure));

describe('film look, as the look route sees it', () => {
  const asked: Array<string> = [];
  it.effect('a request it cannot send is LookInvalid, and no lab is asked', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(takeLook('http://127.0.0.1:4401/', 'f', post(1)));
      expect(error._tag).toBe('LookInvalid');
      expect(asked).toEqual([]);
    }).pipe(Effect.provide(labAnswering(200, '{}', asked))),
  );

  // The route's answer to a look whose page failed, as the lab's own test shows it.
  const routeBody = '{"_tag":"LookFailed","reason":"no easel in this test"}';
  it.effect('a failure prints as the route answered it', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(takeLook('http://127.0.0.1:4401/', 'f', post(640)));
      expect(error._tag).toBe('LookFailed');
      expect(parse(failureJson(error))).toEqual(parse(routeBody));
    }).pipe(Effect.provide(labAnswering(502, routeBody, []))),
  );

  it.effect('every failure printed decodes as one ToolFailure: a lab down, and any other', () =>
    Effect.gen(function* () {
      const down = yield* Effect.flip(takeLook('http://127.0.0.1:1/', 'f', post(640)));
      expect(decodeFailure(failureJson(down))).toMatchObject({ _tag: 'LabDown' });
      const other = { _tag: 'PlatformError', message: 'read failed' };
      expect(decodeFailure(failureJson(other))).toEqual(
        ToolFailed.make({ failed: 'PlatformError', reason: 'read failed' }),
      );
      expect(decodeFailure(routeBody)).toMatchObject({ _tag: 'LookFailed' });
    }).pipe(Effect.provide(FetchHttpClient.layer)),
  );
});
