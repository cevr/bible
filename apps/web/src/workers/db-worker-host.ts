/** Browser Worker host boundary for the Effect-native database runtime. */
import { Effect, Exit, Option, Predicate } from 'effect';

import { makeDatabaseWorkerRuntime } from './db-worker.js';
import { decodeProcedureWorkerConnectExit } from './procedure-worker-protocol.js';

let log = (_line: string): void => {};
if (import.meta.env['DEV']) log = (line) => console.log(line);

const syncAccessHandle = Option.fromUndefinedOr(
  (
    globalThis as typeof globalThis & {
      readonly FileSystemSyncAccessHandle?: { readonly prototype: object };
    }
  ).FileSystemSyncAccessHandle,
);

const runtime = Effect.runSync(
  makeDatabaseWorkerRuntime({
    fetch: globalThis.fetch,
    randomUuid: () => crypto.randomUUID(),
    nowIso: () => new Date().toISOString(),
    supportsUnsafeAccessHandles: Option.exists(syncAccessHandle, (handle) =>
      Object.prototype.hasOwnProperty.call(handle.prototype, 'mode'),
    ),
    log,
    warn: (line) => console.warn(line),
  }),
);

self.onmessage = (event: MessageEvent<unknown>) => {
  if (Exit.isFailure(decodeProcedureWorkerConnectExit(event.data))) {
    console.warn('[web.runtime] message-rejected reason=non-procedure');
    return;
  }
  const port = event.ports[0];
  if (Predicate.isUndefined(port)) {
    console.error('[web.runtime] port-missing kind=procedure');
    return;
  }
  const readinessPort = event.ports[1];
  if (Predicate.isUndefined(readinessPort)) {
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
