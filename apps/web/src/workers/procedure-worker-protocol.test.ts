import { describe, expect, test } from 'bun:test';

import {
  connectProcedureWorker,
  decodeProcedureWorkerConnect,
  type ProcedureWorkerConnect,
  type ProcedureWorkerEndpoint,
} from './procedure-worker-protocol.js';

describe('procedure worker bootstrap', () => {
  test('transfers a dedicated message port without entering the legacy protocol', () => {
    let message: ProcedureWorkerConnect | undefined;
    let transferred: Transferable[] = [];
    const worker: ProcedureWorkerEndpoint = {
      postMessage: (nextMessage, transfer) => {
        message = nextMessage;
        transferred = transfer;
      },
    };

    const clientPort = connectProcedureWorker(worker);

    expect(message).toEqual({ type: 'procedure-connect' });
    expect(transferred).toHaveLength(1);
    expect(transferred[0]).toBeInstanceOf(MessagePort);
    clientPort.close();
    if (transferred[0] instanceof MessagePort) transferred[0].close();
  });

  test('rejects malformed bootstrap messages', () => {
    expect(() => decodeProcedureWorkerConnect({ type: 'init' })).toThrow();
  });
});
