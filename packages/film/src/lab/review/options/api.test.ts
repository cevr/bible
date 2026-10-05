// A review page's Undo and Redo over a real HTTP server: a step whose answer
// is lost on the way back is said by the lab's record of its request (the
// check's `landed`, by the id the page sent), never guessed at.

import { BunHttpServer } from '@effect/platform-bun';
import { HttpServer, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { Context, Effect, Exit, Layer, Option, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { LabClient } from '../../api.ts';
import { ChoiceAct, OptionsApi, optionsApiLayer } from './api.ts';

/** A step's body as the page sends it: the id of its request, if it sent one. */
const Asked = Schema.Struct({ request: Schema.optionalKey(Schema.String) });

/**
 * A lab whose Undo lands but whose answer never decodes (cut short on the
 * way back), and whose check lists the landed step under its request's id
 * when `records` holds.
 */
const lostAnswer = (records: boolean) =>
  Effect.gen(function* () {
    const sent: Array<string> = [];
    const http = yield* BunHttpServer.make({ hostname: '127.0.0.1', port: 0 });
    yield* http.serve(
      Effect.gen(function* () {
        const req = yield* HttpServerRequest.HttpServerRequest;
        const path = new URL(req.url, 'http://localhost').pathname;
        if (path.endsWith('/undo')) {
          const asked = yield* Schema.decodeUnknownEffect(Asked)(yield* req.json);
          sent.push(...Option.toArray(Option.fromUndefinedOr(asked.request)));
          return HttpServerResponse.text('{"file": "sound.ts", "tar');
        }
        if (path.endsWith('/check'))
          return HttpServerResponse.jsonUnsafe({
            findings: [],
            landed: sent
              .filter(() => records)
              .map((request) => ({
                file: 'sound.ts',
                target: 'undo level RAIN -6',
                change: 'k2',
                request,
              })),
          });
        return HttpServerResponse.empty({ status: 404 });
      }).pipe(Effect.orDie),
    );
    const origin = HttpServer.formatAddress(http.address);
    const built = yield* Layer.build(
      optionsApiLayer.pipe(Layer.provide(LabClient.layerAt(origin))),
    );
    return { api: Context.get(built, OptionsApi), sent };
  });

describe("a review page's step whose answer is lost", () => {
  it.live('landed: the lab recorded it under its request, and the page says what it did', () =>
    Effect.gen(function* () {
      const { api, sent } = yield* lostAnswer(true);
      const wrote = yield* api.write('toy', ChoiceAct.Undo({ change: Option.none() }));
      expect(sent).toHaveLength(1);
      expect([wrote.target, wrote.file, wrote.change]).toEqual([
        'undo level RAIN -6',
        'sound.ts',
        Option.some('k2'),
      ]);
    }).pipe(Effect.scoped),
  );

  it.live(
    'not recorded: the lab is unreachable, and the page says the lab has no record of it',
    () =>
      Effect.gen(function* () {
        const { api } = yield* lostAnswer(false);
        const exit = yield* Effect.exit(
          api.write('toy', ChoiceAct.Undo({ change: Option.none() })),
        );
        expect(
          Exit.match(exit, {
            onSuccess: () => 'landed',
            onFailure: (cause) => String(cause),
          }),
        ).toContain('the lab has no record of that undo');
      }).pipe(Effect.scoped),
  );
});
