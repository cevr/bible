import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import {
  connectProcedureWorker,
  decodeProcedureWorkerConnect,
  type ProcedureWorkerConnect,
  type ProcedureWorkerEndpoint,
} from './procedure-worker-protocol.js';

describe('procedure worker bootstrap', () => {
  test('transfers procedure and readiness ports without entering the legacy protocol', async () => {
    let message: ProcedureWorkerConnect | undefined;
    let transferred: Transferable[] = [];
    const worker: ProcedureWorkerEndpoint = {
      postMessage: (nextMessage, transfer) => {
        message = nextMessage;
        transferred = transfer;
      },
    };

    const connection = connectProcedureWorker(worker);

    expect(message).toEqual({ type: 'procedure-connect' });
    expect(transferred).toHaveLength(2);
    expect(transferred[0]).toBeInstanceOf(MessagePort);
    expect(transferred[1]).toBeInstanceOf(MessagePort);
    if (transferred[1] instanceof MessagePort) transferred[1].postMessage({ type: 'ready' });
    await Effect.runPromise(connection.ready);
    connection.port.close();
    if (transferred[0] instanceof MessagePort) transferred[0].close();
    if (transferred[1] instanceof MessagePort) transferred[1].close();
  });

  test('rejects malformed bootstrap messages', () => {
    expect(() => decodeProcedureWorkerConnect({ type: 'init' })).toThrow();
  });

  test('rejects startup when the worker reports a persistent runtime failure', async () => {
    const worker: ProcedureWorkerEndpoint = {
      postMessage: (_message, transfer) => {
        const readinessPort = transfer[1];
        if (!(readinessPort instanceof MessagePort)) throw new TypeError('expected readiness port');
        readinessPort.postMessage({ type: 'failed', message: 'database unavailable' });
      },
    };

    const connection = connectProcedureWorker(worker);
    const failure = await Effect.runPromise(Effect.flip(connection.ready));
    expect(failure.message).toBe('database unavailable');
    connection.port.close();
  });
});
