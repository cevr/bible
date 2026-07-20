import { describe, expect, it } from '@effect/vitest';
import { Deferred, Effect, Fiber } from 'effect';
import type { FromClientEncoded, FromServerEncoded } from 'effect/unstable/rpc/RpcMessage';
import * as RpcClient from 'effect/unstable/rpc/RpcClient';

import { layerDesktopProcedureTransport } from '../src/procedure-client-protocol.js';

const nextMessage = (port: MessagePort): Effect.Effect<FromClientEncoded> =>
  Effect.callback((resume) => {
    const listener = (event: MessageEvent<FromClientEncoded>) => {
      resume(Effect.succeed(event.data));
    };
    port.addEventListener('message', listener);
    port.start();
    return Effect.sync(() => port.removeEventListener('message', listener));
  });

describe('desktop procedure client protocol', () => {
  it.effect('moves raw encoded RPC messages over the Electron port boundary', () =>
    Effect.gen(function* () {
      const channel = yield* Effect.acquireRelease(
        Effect.sync(() => new MessageChannel()),
        (active) =>
          Effect.sync(() => {
            active.port1.close();
            active.port2.close();
          }),
      );

      yield* Effect.gen(function* () {
        const protocol = yield* RpcClient.Protocol;
        const received = yield* Deferred.make<FromServerEncoded>();
        yield* protocol
          .run(7, (message) => Deferred.succeed(received, message).pipe(Effect.asVoid))
          .pipe(Effect.forkScoped);
        const sent = yield* nextMessage(channel.port2).pipe(Effect.forkScoped);
        const request: FromClientEncoded = {
          _tag: 'Request',
          id: 'desktop-request-1',
          tag: 'v1.runtime.connect',
          payload: {},
          headers: [],
        };

        yield* protocol.send(7, request);
        expect(yield* Fiber.join(sent)).toEqual(request);

        const response: FromServerEncoded = {
          _tag: 'Exit',
          requestId: request.id,
          exit: { _tag: 'Success', value: { ready: true } },
        };
        channel.port2.postMessage(response);
        expect(yield* Deferred.await(received)).toEqual(response);
      }).pipe(Effect.provide(layerDesktopProcedureTransport(channel.port1)));
    }),
  );
});
