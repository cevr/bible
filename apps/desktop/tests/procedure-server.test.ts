import { describe, expect, it } from 'effect-bun-test';
import { Deferred, Effect, Option, Queue } from 'effect';
import type { FromClientEncoded, FromServerEncoded } from 'effect/unstable/rpc/RpcMessage';
import * as RpcServer from 'effect/unstable/rpc/RpcServer';

import {
  layerDesktopProcedureProtocol,
  type DesktopProcedureServerPort,
} from '../electron/procedure-server.js';

/** A stand-in for the Electron port, plus the handles the assertions read: what
 *  the protocol subscribed with, what it sent, and how many times it let go. */
interface FakePort {
  readonly port: DesktopProcedureServerPort;
  readonly receive: () => Option.Option<(message: FromClientEncoded) => void>;
  readonly close: () => Option.Option<() => void>;
  readonly started: () => boolean;
  readonly unsubscribed: () => number;
  readonly sent: () => readonly FromServerEncoded[];
}

const fakePort = (): FakePort => {
  let receive: Option.Option<(message: FromClientEncoded) => void> = Option.none();
  let close: Option.Option<() => void> = Option.none();
  let started = false;
  let unsubscribed = 0;
  const sent: FromServerEncoded[] = [];
  return {
    receive: () => receive,
    close: () => close,
    started: () => started,
    unsubscribed: () => unsubscribed,
    sent: () => sent,
    port: {
      subscribe: (listener) => {
        receive = Option.some(listener);
        return () => {
          unsubscribed += 1;
          receive = Option.none();
        };
      },
      onClose: (listener) => {
        close = Option.some(listener);
        return () => {
          unsubscribed += 1;
          close = Option.none();
        };
      },
      send: (message) => sent.push(message),
      start: () => {
        started = true;
      },
    },
  };
};

/** The protocol exchange under test, with its layer provided at this function's
 *  own boundary rather than inside the test's generator. */
const exchangeOver = (fake: FakePort) =>
  Effect.gen(function* () {
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
    const receive = fake.receive();
    if (Option.isNone(receive)) return yield* Effect.die('port did not subscribe');
    receive.value(request);
    expect(yield* Deferred.await(received)).toEqual(request);

    const response: FromServerEncoded = {
      _tag: 'Exit',
      requestId: 'desktop-request-1',
      exit: { _tag: 'Success', value: { ready: true } },
    };
    yield* protocol.send(0, response);
    expect(fake.sent()).toEqual([response]);
    expect(fake.started()).toBe(true);

    const close = fake.close();
    if (Option.isNone(close)) return yield* Effect.die('port did not register close');
    close.value();
    expect(yield* Queue.take(protocol.disconnects)).toBe(0);
    expect(yield* protocol.clientIds).toEqual(new Set());
  }).pipe(Effect.provide(layerDesktopProcedureProtocol(fake.port)));

describe('desktop procedure protocol', () => {
  it.scoped('moves encoded RPC messages over the Electron port boundary', () =>
    Effect.gen(function* () {
      const fake = fakePort();

      yield* exchangeOver(fake);

      expect(fake.unsubscribed()).toBe(2);
    }),
  );
});
