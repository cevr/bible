import { contextBridge, ipcRenderer } from 'electron';
import { DesktopProcedurePortMessage } from '../shared/procedure-channel.js';

let procedurePort: MessagePort | undefined;
let procedurePortReady = false;

const deliverProcedurePort = (): void => {
  if (!procedurePortReady || procedurePort === undefined) return;
  const port = procedurePort;
  procedurePort = undefined;
  window.postMessage(DesktopProcedurePortMessage, '*', [port]);
};
ipcRenderer.on('bible:procedure-port', (event) => {
  const port = event.ports[0];
  if (port === undefined) return;
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
