import { Schema } from 'effect';

export const ProcedureWorkerConnect = Schema.Struct({
  type: Schema.Literal('procedure-connect'),
});
export type ProcedureWorkerConnect = typeof ProcedureWorkerConnect.Type;

export const decodeProcedureWorkerConnect = Schema.decodeUnknownSync(ProcedureWorkerConnect);

export interface ProcedureWorkerEndpoint {
  readonly postMessage: (message: ProcedureWorkerConnect, transfer: Transferable[]) => void;
}

export const connectProcedureWorker = (worker: ProcedureWorkerEndpoint): MessagePort => {
  const channel = new MessageChannel();
  worker.postMessage(decodeProcedureWorkerConnect({ type: 'procedure-connect' }), [channel.port2]);
  return channel.port1;
};
