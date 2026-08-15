import { Effect, Layer, Option, Queue } from 'effect';
import type { FromClientEncoded, FromServerEncoded } from 'effect/unstable/rpc/RpcMessage';
import * as RpcClient from 'effect/unstable/rpc/RpcClient';
import { RpcClientDefect, RpcClientError } from 'effect/unstable/rpc/RpcClientError';

const protocolFailure = (message: string, cause: unknown): RpcClientError =>
  RpcClientError.make({ reason: RpcClientDefect.make({ message, cause }) });

/** Moves Effect RPC's raw encoded protocol over one renderer-owned MessagePort. */
export const layerDesktopProcedureTransport = (
  port: MessagePort,
): Layer.Layer<RpcClient.Protocol> =>
  Layer.effect(
    RpcClient.Protocol,
    RpcClient.Protocol.make((writeResponse, clientIds) =>
      Effect.gen(function* () {
        const incoming = yield* Queue.make<FromServerEncoded>();
        const requestClients = new Map<string | number, number>();
        const onMessage = (event: MessageEvent): void => {
          Queue.offerUnsafe(incoming, event.data);
        };
        const broadcast = (response: FromServerEncoded) =>
          Effect.forEach(clientIds, (clientId) => writeResponse(clientId, response), {
            discard: true,
          });
        const receive = (response: FromServerEncoded) => {
          if (response._tag !== 'Chunk' && response._tag !== 'Exit') return broadcast(response);
          return Option.match(Option.fromUndefinedOr(requestClients.get(response.requestId)), {
            onNone: () => broadcast(response),
            onSome: (clientId) => {
              if (response._tag === 'Exit') requestClients.delete(response.requestId);
              return writeResponse(clientId, response);
            },
          });
        };

        port.addEventListener('message', onMessage);
        port.start();
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            port.removeEventListener('message', onMessage);
            port.close();
          }),
        );
        yield* Queue.take(incoming).pipe(
          Effect.flatMap(receive),
          Effect.forever,
          Effect.forkScoped,
        );
        yield* Effect.logInfo('[desktop.rpc] connected');

        return {
          send: (clientId: number, request: FromClientEncoded) => {
            if (request._tag === 'Request') requestClients.set(request.id, clientId);
            if (request._tag === 'Interrupt') requestClients.delete(request.requestId);
            return Effect.try({
              try: () => port.postMessage(request),
              catch: (cause) => protocolFailure('Unable to send desktop RPC message', cause),
            });
          },
          supportsAck: false,
          supportsTransferables: false,
        };
      }),
    ),
  );
