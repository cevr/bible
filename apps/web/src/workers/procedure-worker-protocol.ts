import { Effect, Schema } from 'effect';

export const ProcedureWorkerConnect = Schema.Struct({
  type: Schema.Literal('procedure-connect'),
});
export type ProcedureWorkerConnect = typeof ProcedureWorkerConnect.Type;

const ProcedureWorkerReadiness = Schema.Union([
  Schema.Struct({ type: Schema.Literal('ready') }),
  Schema.Struct({ type: Schema.Literal('failed'), message: Schema.String }),
]);
type ProcedureWorkerReadiness = typeof ProcedureWorkerReadiness.Type;

export const decodeProcedureWorkerConnect = Schema.decodeUnknownSync(ProcedureWorkerConnect);

export interface ProcedureWorkerEndpoint {
  readonly postMessage: (message: ProcedureWorkerConnect, transfer: Transferable[]) => void;
}

export interface ProcedureWorkerConnection {
  readonly port: MessagePort;
  readonly ready: Effect.Effect<void, ProcedureWorkerStartupError>;
}

export class ProcedureWorkerStartupError extends Schema.TaggedErrorClass<ProcedureWorkerStartupError>()(
  'ProcedureWorkerStartupError',
  { message: Schema.String },
) {}

export const connectProcedureWorker = (
  worker: ProcedureWorkerEndpoint,
): ProcedureWorkerConnection => {
  const procedure = new MessageChannel();
  const readiness = new MessageChannel();
  const decodeReadiness = Schema.decodeUnknownSync(ProcedureWorkerReadiness);
  const ready = Effect.callback<void, ProcedureWorkerStartupError>((resume) => {
    readiness.port1.onmessage = (event: MessageEvent<unknown>) => {
      const result = decodeReadiness(event.data);
      readiness.port1.close();
      if (result.type === 'ready') resume(Effect.void);
      else resume(Effect.fail(new ProcedureWorkerStartupError({ message: result.message })));
    };
    readiness.port1.start();
    return Effect.sync(() => readiness.port1.close());
  });
  worker.postMessage(decodeProcedureWorkerConnect({ type: 'procedure-connect' }), [
    procedure.port2,
    readiness.port2,
  ]);
  return { port: procedure.port1, ready };
};
