import * as BrowserWorker from '@effect/platform-browser/BrowserWorker';
import { ProcedureHost, ProcedureHostLive, type ProcedureHostShape } from '@bible/app/procedure';
import { Effect, Layer, ManagedRuntime, Schema } from 'effect';
import * as RpcClient from 'effect/unstable/rpc/RpcClient';

import type { ProcedureWorkerEndpoint } from './procedure-worker-protocol.js';
import { connectProcedureWorker } from './procedure-worker-protocol.js';

export const layerWebProcedureTransport = (port: MessagePort) =>
  RpcClient.layerProtocolWorker({ size: 1 }).pipe(Layer.provide(BrowserWorker.layer(() => port)));

export const layerWebProcedureHost = (port: MessagePort) =>
  ProcedureHostLive.pipe(Layer.provide(layerWebProcedureTransport(port)));

export class WebProcedureHostStartError extends Schema.TaggedErrorClass<WebProcedureHostStartError>()(
  'WebProcedureHostStartError',
  {
    stage: Schema.Literal('connect'),
    cause: Schema.Unknown,
  },
) {}

export interface ActiveWebProcedureHost extends ProcedureHostShape {
  readonly dispose: () => Promise<void>;
}

/** Owns the renderer-side Effect runtime for exactly as long as its Solid root. */
export const startWebProcedureHost = (
  worker: ProcedureWorkerEndpoint,
): Promise<ActiveWebProcedureHost> => {
  const start = Effect.gen(function* () {
    const connection = connectProcedureWorker(worker);
    yield* connection.ready.pipe(
      Effect.mapError((cause) => new WebProcedureHostStartError({ stage: 'connect', cause })),
    );
    const runtime = ManagedRuntime.make(layerWebProcedureHost(connection.port));
    const host = yield* Effect.tryPromise({
      try: () => runtime.runPromise(ProcedureHost),
      catch: (cause) => new WebProcedureHostStartError({ stage: 'connect', cause }),
    }).pipe(Effect.onError(() => runtime.disposeEffect));
    return { ...host, dispose: () => runtime.dispose() };
  });
  return Effect.runPromise(start);
};
