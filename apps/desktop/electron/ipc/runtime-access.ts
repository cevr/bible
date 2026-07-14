import type { MainRuntime } from '../runtime.js';

/** Late-bound access to the main runtime constructed after Electron is ready. */
export type MainRuntimeAccess = () => MainRuntime | null;
