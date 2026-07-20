/** Browser Worker host boundary for the Effect-native database runtime. */
import { Effect } from 'effect';

import { makeDatabaseWorkerRuntime } from './db-worker.js';
import {
  decodeProcedureWorkerConnect,
  type ProcedureWorkerConnect,
} from './procedure-worker-protocol.js';

let log = (_line: string): void => {};
if (import.meta.env['DEV']) log = (line) => console.log(line);

const syncAccessHandle = (
  globalThis as typeof globalThis & {
    readonly FileSystemSyncAccessHandle?: { readonly prototype: object };
  }
).FileSystemSyncAccessHandle;

const runtime = Effect.runSync(
  makeDatabaseWorkerRuntime({
    fetch: globalThis.fetch,
    randomUuid: () => crypto.randomUUID(),
    nowIso: () => new Date().toISOString(),
    supportsUnsafeAccessHandles:
      syncAccessHandle !== undefined &&
      Object.prototype.hasOwnProperty.call(syncAccessHandle.prototype, 'mode'),
    log,
    warn: (line) => console.warn(line),
  }),
);

const isProcedureConnect = (input: unknown): input is ProcedureWorkerConnect =>
  typeof input === 'object' &&
  input !== null &&
  'type' in input &&
  input.type === 'procedure-connect';

self.onmessage = (event: MessageEvent<unknown>) => {
  if (!isProcedureConnect(event.data)) {
    console.warn('[web.runtime] message-rejected reason=non-procedure');
    return;
  }
  decodeProcedureWorkerConnect(event.data);
  const port = event.ports[0];
  if (port === undefined) {
    console.error('[web.runtime] port-missing kind=procedure');
    return;
  }
  const readinessPort = event.ports[1];
  if (readinessPort === undefined) {
    console.error('[web.runtime] port-missing kind=readiness');
    port.close();
    return;
  }
  readinessPort.start();
  Effect.runFork(
    runtime.initialize.pipe(
      Effect.tap((server) =>
        Effect.sync(() => {
          Effect.runFork(runtime.launch(server, port));
          readinessPort.postMessage({ type: 'ready' });
          readinessPort.close();
        }),
      ),
      Effect.catch((cause) =>
        Effect.sync(() => {
          readinessPort.postMessage({ type: 'failed', message: String(cause) });
          readinessPort.close();
          port.close();
        }),
      ),
    ),
  );
};
