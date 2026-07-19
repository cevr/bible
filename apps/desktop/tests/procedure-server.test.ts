import { Effect, Fiber, ManagedRuntime, Queue } from 'effect';
import type { FromClientEncoded, FromServerEncoded } from 'effect/unstable/rpc/RpcMessage';
import * as RpcServer from 'effect/unstable/rpc/RpcServer';
import { describe, expect, test, vi } from 'vitest';

import {
  layerDesktopProcedureProtocol,
  type DesktopProcedureServerPort,
} from '../electron/procedure-server.js';

describe('desktop procedure protocol', () => {
  test('moves encoded RPC messages over the Electron port boundary', async () => {
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
    const runtime = ManagedRuntime.make(layerDesktopProcedureProtocol(port));
    const protocol = await runtime.runPromise(RpcServer.Protocol);
    const received: FromClientEncoded[] = [];
    const runner = runtime.runFork(
      protocol.run((_clientId, message) =>
        Effect.sync(() => {
          received.push(message);
        }),
      ),
    );

    const request: FromClientEncoded = {
      _tag: 'Request',
      id: 'desktop-request-1',
      tag: 'v1.runtime.connect',
      payload: {},
      headers: [],
    };
    receive?.(request);
    await vi.waitFor(() => expect(received).toEqual([request]));

    const response: FromServerEncoded = {
      _tag: 'Exit',
      requestId: 'desktop-request-1',
      exit: { _tag: 'Success', value: { ready: true } },
    };
    await runtime.runPromise(protocol.send(0, response));
    expect(sent).toEqual([response]);
    expect(started).toBe(true);

    close?.();
    expect(await Effect.runPromise(Queue.take(protocol.disconnects))).toBe(0);
    expect(await runtime.runPromise(protocol.clientIds)).toEqual(new Set());

    await Effect.runPromise(Fiber.interrupt(runner));
    await runtime.dispose();
    expect(unsubscribed).toBe(2);
  });
});
