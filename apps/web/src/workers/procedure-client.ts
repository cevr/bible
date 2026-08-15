import * as BrowserWorker from '@effect/platform-browser/BrowserWorker';
import {
  ProcedureHostLive,
  ProcedureHostStartError,
  startProcedureHost,
  type ActiveProcedureHost,
} from '@bible/app/procedure';
import { Effect, Layer } from 'effect';
import * as RpcClient from 'effect/unstable/rpc/RpcClient';

import type { ProcedureWorkerEndpoint } from './procedure-worker-protocol.js';
import { connectProcedureWorker } from './procedure-worker-protocol.js';

export const layerWebProcedureTransport = (port: MessagePort) =>
  RpcClient.layerProtocolWorker({ size: 1 }).pipe(Layer.provide(BrowserWorker.layer(() => port)));

export const layerWebProcedureHost = (port: MessagePort) =>
  ProcedureHostLive.pipe(Layer.provide(layerWebProcedureTransport(port)));

/** Web supplies the database worker connection; the lifetime is shared. */
export const startWebProcedureHost = (
  worker: ProcedureWorkerEndpoint,
): Promise<ActiveProcedureHost> =>
  startProcedureHost(
    Effect.gen(function* () {
      const connection = connectProcedureWorker(worker);
      yield* connection.ready.pipe(
        Effect.mapError((cause) => ProcedureHostStartError.make({ stage: 'connect', cause })),
      );
      return layerWebProcedureHost(connection.port);
    }),
  );
