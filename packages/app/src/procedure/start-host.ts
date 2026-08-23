import type { Layer } from 'effect';
import { Effect, ManagedRuntime, Schema } from 'effect';

import { ProcedureHost, type ProcedureHostApi } from './client.js';

export class ProcedureHostStartError extends Schema.TaggedError<ProcedureHostStartError>()(
  'ProcedureHostStartError',
  {
    stage: Schema.Literal('connect'),
    cause: Schema.Unknown,
  },
) {}

export interface ActiveProcedureHost extends ProcedureHostApi {
  readonly dispose: () => Promise<void>;
}

/**
 * Owns the renderer-side Effect runtime for exactly as long as its Solid
 * root. A host supplies only `acquire` — the effect that produces its
 * transport-provided `ProcedureHost` layer; runtime construction, connect
 * failure wrapping, dispose-on-error, and the dispose handle are shared.
 */
export const startProcedureHost = (
  acquire: Effect.Effect<Layer.Layer<ProcedureHost, unknown>, unknown>,
): Promise<ActiveProcedureHost> =>
  Effect.runPromise(acquire).then((layer) => {
    // The runtime is constructed here, at the Promise boundary that owns it,
    // rather than inside an Effect that would already have a runtime of its own.
    const runtime = ManagedRuntime.make(layer);
    return Effect.runPromise(
      Effect.tryPromise({
        try: () => runtime.runPromise(ProcedureHost),
        catch: (cause) => ProcedureHostStartError.make({ stage: 'connect', cause }),
      }).pipe(
        Effect.onError(() => runtime.disposeEffect),
        Effect.map((host) => ({ ...host, dispose: () => runtime.dispose() })),
      ),
    );
  });
