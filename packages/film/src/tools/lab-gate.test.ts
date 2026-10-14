// The gate reads a write's body before any route does (to bound it). What a
// route registers to run on its answer (Effect's pre-response handlers: an
// MCP session's header) is kept: the read body reaches the route as the
// request the handler took, never swapped under it.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer } from 'effect';
import { HttpEffect, HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { labHandler } from './lab.ts';
import { labInMemory, text } from './testing.ts';

const bound = { hostname: '127.0.0.1', port: 4401 } as const;

/** A route beside the API that echoes its body and adds a header as its answer goes out. */
const echo = HttpRouter.add(
  'POST',
  '/echo',
  Effect.gen(function* () {
    const body = yield* Effect.orDie((yield* HttpServerRequest.HttpServerRequest).text);
    yield* HttpEffect.appendPreResponseHandler((_request, response) =>
      Effect.succeed(HttpServerResponse.setHeader(response, 'x-kept', 'yes')),
    );
    return HttpServerResponse.text(body);
  }),
);

describe("the lab's gate", () => {
  it.effect("keeps what a route registers on its answer when it has read the route's body", () =>
    Effect.gen(function* () {
      const lab = yield* labHandler({ hosts: [] }, Layer.mergeAll(echo));
      const answer = yield* Effect.promise(() =>
        lab(
          new Request('http://127.0.0.1:4401/echo', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{"said":"hello"}',
          }),
          bound,
        ),
      );
      expect([
        answer.status,
        answer.headers.get('x-kept'),
        yield* Effect.promise(() => answer.text()),
      ]).toEqual([200, 'yes', '{"said":"hello"}']);
    }).pipe(
      Effect.scoped,
      Effect.provide(labInMemory(new Map([['/films/f/scenes/index.ts', text('export {};\n')]]))),
    ),
  );
});
