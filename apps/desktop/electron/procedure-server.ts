import {
  BibleProcedureGroup,
  BibleProcedureHandlers,
  type ProcedureRuntime,
  type ReadingPreferencesRuntime,
  type LibraryStateRuntime,
} from '@bible/core/procedure';
import type { BibleService } from '@bible/core/bible/service';
import type { WritingsService } from '@bible/core/writings/service';
import { Effect, Layer, Option, Queue } from 'effect';
import type { FromClientEncoded, FromServerEncoded } from 'effect/unstable/rpc/RpcMessage';
import * as RpcServer from 'effect/unstable/rpc/RpcServer';

const CLIENT_ID = 0;

export interface DesktopProcedureServerPort {
  readonly subscribe: (listener: (message: FromClientEncoded) => void) => () => void;
  readonly onClose: (listener: () => void) => () => void;
  readonly send: (message: FromServerEncoded) => void;
  readonly start: () => void;
}

export const layerDesktopProcedureProtocol = (
  port: DesktopProcedureServerPort,
): Layer.Layer<RpcServer.Protocol> =>
  Layer.effect(
    RpcServer.Protocol,
    RpcServer.Protocol.make((writeRequest) =>
      Effect.gen(function* () {
        const incoming = yield* Queue.make<FromClientEncoded>();
        const disconnects = yield* Queue.make<number>();
        const clientIds = new Set([CLIENT_ID]);
        const unsubscribe = port.subscribe((message) => {
          Queue.offerUnsafe(incoming, message);
        });
        const unsubscribeClose = port.onClose(() => {
          clientIds.delete(CLIENT_ID);
          Queue.offerUnsafe(disconnects, CLIENT_ID);
        });

        port.start();
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            unsubscribe();
            unsubscribeClose();
          }),
        );
        yield* Queue.take(incoming).pipe(
          Effect.flatMap((message) => writeRequest(CLIENT_ID, message)),
          Effect.forever,
          Effect.forkScoped,
        );

        return {
          disconnects,
          send: (_clientId, response) => Effect.sync(() => port.send(response)),
          end: () => Effect.void,
          clientIds: Effect.sync(() => clientIds),
          initialMessage: Effect.succeed(Option.none()),
          supportsAck: false,
          supportsTransferables: false,
          supportsSpanPropagation: false,
        };
      }),
    ),
  );

export const layerDesktopProcedureServer = (
  port: DesktopProcedureServerPort,
): Layer.Layer<
  never,
  never,
  | BibleService
  | WritingsService
  | ProcedureRuntime
  | ReadingPreferencesRuntime
  | LibraryStateRuntime
> =>
  RpcServer.layer(BibleProcedureGroup).pipe(
    Layer.provide(BibleProcedureHandlers),
    Layer.provide(layerDesktopProcedureProtocol(port)),
  );
