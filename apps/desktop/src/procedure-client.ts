import { ProcedureHost, ProcedureHostLive, type ProcedureHostShape } from '@bible/app/procedure';
import { Effect, Layer, ManagedRuntime, Schema } from 'effect';

import { layerDesktopProcedureTransport } from './procedure-client-protocol.js';
import { waitForDesktopProcedurePort } from './procedure-port.js';

export const layerDesktopProcedureHost = (port: MessagePort) =>
  ProcedureHostLive.pipe(Layer.provide(layerDesktopProcedureTransport(port)));

export class DesktopProcedureHostStartError extends Schema.TaggedErrorClass<DesktopProcedureHostStartError>()(
  'DesktopProcedureHostStartError',
  {
    stage: Schema.Literal('connect'),
    cause: Schema.Unknown,
  },
) {}

export interface ActiveDesktopProcedureHost extends ProcedureHostShape {
  readonly dispose: () => Promise<void>;
}

/** Owns the desktop renderer runtime for exactly as long as its Solid root. */
export const startDesktopProcedureHost = (): Promise<ActiveDesktopProcedureHost> => {
  const start = Effect.gen(function* () {
    const port = yield* waitForDesktopProcedurePort;
    const runtime = ManagedRuntime.make(layerDesktopProcedureHost(port));
    const host = yield* Effect.tryPromise({
      try: () => runtime.runPromise(ProcedureHost),
      catch: (cause) => new DesktopProcedureHostStartError({ stage: 'connect', cause }),
    }).pipe(Effect.onError(() => runtime.disposeEffect));
    return { ...host, dispose: () => runtime.dispose() };
  });
  return Effect.runPromise(start);
};
