import * as BrowserWorker from '@effect/platform-browser/BrowserWorker';
import { ProcedureHost, ProcedureHostLive, type ProcedureHostShape } from '@bible/app/procedure';
import { Effect, Layer, ManagedRuntime, Schema } from 'effect';
import * as RpcClient from 'effect/unstable/rpc/RpcClient';

import type { ProcedureWorkerEndpoint } from './procedure-worker-protocol.js';
import { connectProcedureWorker } from './procedure-worker-protocol.js';

export const layerWebProcedureTransport = (port: MessagePort) =>
  RpcClient.layerProtocolWorker({ size: 1 }).pipe(Layer.provide(BrowserWorker.layer(() => port)));

export const layerWebProcedureHost = (worker: ProcedureWorkerEndpoint) =>
  ProcedureHostLive.pipe(Layer.provide(layerWebProcedureTransport(connectProcedureWorker(worker))));

export class WebProcedureHostStartError extends Schema.TaggedErrorClass<WebProcedureHostStartError>()(
  'WebProcedureHostStartError',
  {
    stage: Schema.Literals(['initialize', 'connect']),
    cause: Schema.Unknown,
  },
) {}

export interface ActiveWebProcedureHost extends ProcedureHostShape {
  readonly dispose: () => Promise<void>;
}

export interface StartWebProcedureHostInput {
  readonly worker: ProcedureWorkerEndpoint;
  readonly initialize: () => Promise<void>;
}

/** Owns the renderer-side Effect runtime for exactly as long as its Solid root. */
export const startWebProcedureHost = (
  input: StartWebProcedureHostInput,
): Promise<ActiveWebProcedureHost> => {
  const start = Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: input.initialize,
      catch: (cause) => new WebProcedureHostStartError({ stage: 'initialize', cause }),
    });
    const runtime = ManagedRuntime.make(layerWebProcedureHost(input.worker));
    const host = yield* Effect.tryPromise({
      try: () => runtime.runPromise(ProcedureHost),
      catch: (cause) => new WebProcedureHostStartError({ stage: 'connect', cause }),
    }).pipe(Effect.onError(() => runtime.disposeEffect));
    return { ...host, dispose: () => runtime.dispose() };
  });
  return Effect.runPromise(start);
};
