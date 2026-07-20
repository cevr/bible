import { describe, expect, it } from 'effect-bun-test';
import { Deferred, Effect, Queue } from 'effect';
import type { FromClientEncoded, FromServerEncoded } from 'effect/unstable/rpc/RpcMessage';
import * as RpcServer from 'effect/unstable/rpc/RpcServer';

import {
  layerDesktopProcedureProtocol,
  type DesktopProcedureServerPort,
} from '../electron/procedure-server.js';

describe('desktop procedure protocol', () => {
  it.scoped('moves encoded RPC messages over the Electron port boundary', () =>
    Effect.gen(function* () {
      let receive: ((message: FromClientEncoded) => void) | undefined;
      let close: (() => void) | undefined;
      let started = false;
      let unsubscribed = 0;
      const sent: FromServerEncoded[] = [];
      const port: DesktopProcedureServerPort = {
        subscribe: (listener) => {
          receive = listener;
          return () => {
            unsubscribed += 1;
            receive = undefined;
          };
        },
        onClose: (listener) => {
          close = listener;
          return () => {
            unsubscribed += 1;
            close = undefined;
          };
        },
        send: (message) => sent.push(message),
        start: () => {
          started = true;
        },
      };

      yield* Effect.gen(function* () {
        const protocol = yield* RpcServer.Protocol;
        const received = yield* Deferred.make<FromClientEncoded>();
        yield* protocol
          .run((_clientId, message) => Deferred.succeed(received, message).pipe(Effect.asVoid))
          .pipe(Effect.forkScoped);

        const request: FromClientEncoded = {
          _tag: 'Request',
          id: 'desktop-request-1',
          tag: 'v1.runtime.connect',
          payload: {},
          headers: [],
        };
        if (receive === undefined) return yield* Effect.die('port did not subscribe');
        receive(request);
        expect(yield* Deferred.await(received)).toEqual(request);

        const response: FromServerEncoded = {
          _tag: 'Exit',
          requestId: 'desktop-request-1',
          exit: { _tag: 'Success', value: { ready: true } },
        };
        yield* protocol.send(0, response);
        expect(sent).toEqual([response]);
        expect(started).toBe(true);

        if (close === undefined) return yield* Effect.die('port did not register close');
        close();
        expect(yield* Queue.take(protocol.disconnects)).toBe(0);
        expect(yield* protocol.clientIds).toEqual(new Set());
      }).pipe(Effect.provide(layerDesktopProcedureProtocol(port)));

      expect(unsubscribed).toBe(2);
    }),
  );
});
