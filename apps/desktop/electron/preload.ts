import { Option } from 'effect';
import { contextBridge, ipcRenderer } from 'electron';
import { DesktopProcedurePortMessage } from '../shared/procedure-channel.js';

let procedurePort: Option.Option<MessagePort> = Option.none();
let procedurePortReady = false;

const deliverProcedurePort = (): void => {
  if (!procedurePortReady) return;
  const port = procedurePort;
  if (Option.isNone(port)) return;
  procedurePort = Option.none();
  window.postMessage(DesktopProcedurePortMessage, '*', [port.value]);
};
ipcRenderer.on('bible:procedure-port', (event) => {
  const port = Option.fromUndefinedOr(event.ports[0]);
  if (Option.isNone(port)) return;
  procedurePort = port;
  deliverProcedurePort();
});

const api = {
  procedure: {
    ready: () => {
      procedurePortReady = true;
      deliverProcedurePort();
    },
  },
  files: {
    select: (accept: readonly string[]) => ipcRenderer.invoke('bible:file-select', accept),
    save: (options: { readonly suggestedName: string; readonly contents: Uint8Array }) =>
      ipcRenderer.invoke('bible:file-save', options),
  },
};

contextBridge.exposeInMainWorld('api', api);
