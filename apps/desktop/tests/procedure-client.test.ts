import { Effect, Fiber, ManagedRuntime } from 'effect';
import type { FromClientEncoded, FromServerEncoded } from 'effect/unstable/rpc/RpcMessage';
import * as RpcClient from 'effect/unstable/rpc/RpcClient';
import { describe, expect, test, vi } from 'vitest';

import { layerDesktopProcedureTransport } from '../src/procedure-client-protocol.js';

describe('desktop procedure client protocol', () => {
  test('moves raw encoded RPC messages over the Electron port boundary', async () => {
    const channel = new MessageChannel();
    const runtime = ManagedRuntime.make(layerDesktopProcedureTransport(channel.port1));
    const protocol = await runtime.runPromise(RpcClient.Protocol);
    const received: FromServerEncoded[] = [];
    const runner = runtime.runFork(
      protocol.run(7, (message) =>
        Effect.sync(() => {
          received.push(message);
        }),
      ),
    );
    const sent = new Promise<FromClientEncoded>((resolve) => {
      channel.port2.addEventListener('message', (event) => resolve(event.data));
      channel.port2.start();
    });
    const request: FromClientEncoded = {
      _tag: 'Request',
      id: 'desktop-request-1',
      tag: 'v1.runtime.connect',
      payload: {},
      headers: [],
    };

    await runtime.runPromise(protocol.send(7, request));
    await expect(sent).resolves.toEqual(request);

    const response: FromServerEncoded = {
      _tag: 'Exit',
      requestId: request.id,
      exit: { _tag: 'Success', value: { ready: true } },
    };
    channel.port2.postMessage(response);
    await vi.waitFor(() => expect(received).toEqual([response]));

    await Effect.runPromise(Fiber.interrupt(runner));
    await runtime.dispose();
    channel.port2.close();
  });
});
