import type { DesktopApi } from '../electron/preload.ts';

declare global {
  interface Window {
    readonly api: DesktopApi;
  }
}

export {};
