import type { Layer } from 'effect';
import { Effect, ManagedRuntime, Schema } from 'effect';

import { ProcedureHost, type ProcedureHostShape } from './client.js';

export class ProcedureHostStartError extends Schema.TaggedErrorClass<ProcedureHostStartError>()(
  'ProcedureHostStartError',
  {
    stage: Schema.Literal('connect'),
    cause: Schema.Unknown,
  },
) {}

export interface ActiveProcedureHost extends ProcedureHostShape {
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
  Effect.runPromise(
    Effect.gen(function* () {
      const layer = yield* acquire;
      const runtime = ManagedRuntime.make(layer);
      const host = yield* Effect.tryPromise({
        try: () => runtime.runPromise(ProcedureHost),
        catch: (cause) => new ProcedureHostStartError({ stage: 'connect', cause }),
      }).pipe(Effect.onError(() => runtime.disposeEffect));
      return { ...host, dispose: () => runtime.dispose() };
    }),
  );
