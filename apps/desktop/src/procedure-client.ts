import {
  ProcedureHostLive,
  startProcedureHost,
  type ActiveProcedureHost,
} from '@bible/app/procedure';
import { Effect, Layer } from 'effect';

import { layerDesktopProcedureTransport } from './procedure-client-protocol.js';
import { waitForDesktopProcedurePort } from './procedure-port.js';

export const layerDesktopProcedureHost = (port: MessagePort) =>
  ProcedureHostLive.pipe(Layer.provide(layerDesktopProcedureTransport(port)));

/** Desktop supplies the transferred procedure port; the lifetime is shared. */
export const startDesktopProcedureHost = (): Promise<ActiveProcedureHost> =>
  startProcedureHost(Effect.map(waitForDesktopProcedurePort, layerDesktopProcedureHost));
