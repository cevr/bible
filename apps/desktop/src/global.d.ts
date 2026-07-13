import type { DesktopApi } from '../electron/ipc-contract.js';

declare global {
  interface Window {
    readonly api: DesktopApi;
  }
}

export {};
