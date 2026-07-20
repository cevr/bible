import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import {
  connectProcedureWorker,
  decodeProcedureWorkerConnect,
  type ProcedureWorkerConnect,
  type ProcedureWorkerEndpoint,
} from './procedure-worker-protocol.js';

describe('procedure worker bootstrap', () => {
  it.scoped('transfers procedure and readiness ports without entering the legacy protocol', () =>
    Effect.gen(function* () {
      let message: ProcedureWorkerConnect | undefined;
      let transferred: Transferable[] = [];
      const worker: ProcedureWorkerEndpoint = {
        postMessage: (nextMessage, transfer) => {
          message = nextMessage;
          transferred = transfer;
        },
      };

      const connection = connectProcedureWorker(worker);
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          connection.port.close();
          for (const transferable of transferred)
            if (transferable instanceof MessagePort) transferable.close();
        }),
      );

      expect(message).toEqual({ type: 'procedure-connect' });
      expect(transferred).toHaveLength(2);
      expect(transferred[0]).toBeInstanceOf(MessagePort);
      expect(transferred[1]).toBeInstanceOf(MessagePort);
      if (transferred[1] instanceof MessagePort) transferred[1].postMessage({ type: 'ready' });
      yield* connection.ready;
    }),
  );

  it.effect('rejects malformed bootstrap messages', () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        Effect.try(() => decodeProcedureWorkerConnect({ type: 'init' })),
      );

      expect(failure).toBeDefined();
    }),
  );

  it.scoped('rejects startup when the worker reports a persistent runtime failure', () =>
    Effect.gen(function* () {
      let transferred: Transferable[] = [];
      const worker: ProcedureWorkerEndpoint = {
        postMessage: (_message, transfer) => {
          transferred = transfer;
        },
      };

      const connection = connectProcedureWorker(worker);
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          connection.port.close();
          for (const transferable of transferred)
            if (transferable instanceof MessagePort) transferable.close();
        }),
      );
      const readinessPort = transferred[1];
      if (!(readinessPort instanceof MessagePort))
        return yield* Effect.die('expected readiness port');
      readinessPort.postMessage({ type: 'failed', message: 'database unavailable' });

      const failure = yield* Effect.flip(connection.ready);
      expect(failure.message).toBe('database unavailable');
    }),
  );
});
