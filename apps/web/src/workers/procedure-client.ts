import * as BrowserWorker from '@effect/platform-browser/BrowserWorker';
import { ProcedureHostLive } from '@bible/app/procedure';
import { Layer } from 'effect';
import * as RpcClient from 'effect/unstable/rpc/RpcClient';

import type { ProcedureWorkerEndpoint } from './procedure-worker-protocol.js';
import { connectProcedureWorker } from './procedure-worker-protocol.js';

export const layerWebProcedureTransport = (port: MessagePort) =>
  RpcClient.layerProtocolWorker({ size: 1 }).pipe(Layer.provide(BrowserWorker.layer(() => port)));

export const layerWebProcedureHost = (worker: ProcedureWorkerEndpoint) =>
  ProcedureHostLive.pipe(Layer.provide(layerWebProcedureTransport(connectProcedureWorker(worker))));
